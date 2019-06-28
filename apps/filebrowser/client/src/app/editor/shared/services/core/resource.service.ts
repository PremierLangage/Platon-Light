import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { IResource, ResourceTypes, createResource, } from '../../models/resource.model';
import { Subject } from 'rxjs';
import { GitService } from './git.service';
import { TaskService } from './task.service';
import { basename } from 'src/app/shared/models/paths.model';
import { Asserts } from 'src/app/shared/models/assert.model';

import * as filters from '../../models/filters.model';

@Injectable({
    providedIn: 'root'
})
export class ResourceService {

    private cache: IResource[] = [];
    private resources: IResource[] = [];
   /** the focused resource */
    private _focused: IResource;

    /**
     * event that emits after a resource is renamed
     * with an object
     *
     * {
     * before: string,
     * after: string
     * }
     *
     * where `before` is the path before the renaming and `after` the path after the renaming
    */
    readonly renamed: Subject<{ before: string, after: string }> = new Subject();

    /** event that emits after a resource is created */
    readonly created: Subject<IResource> = new Subject();

    /** event that emits after a resource is deleted */
    readonly deleted: Subject<IResource> = new Subject();

    /** event that emits each time any resource is created|deleted|renamed  */
    readonly changed: Subject<IResource[]> = new Subject();

    /** event that emits each time the focused resource change */
    readonly focusChanged: Subject<IResource> = new Subject();


    get home() {
      return this.resources[0];
    }

    get focused(): IResource {
      return this._focused;
    }

    constructor(
        private readonly git: GitService,
        private readonly http: HttpClient,
        private readonly task: TaskService,
    ) { }

    focus(resource: IResource) {
        this._focused = resource;
        if (resource.type === ResourceTypes.Folder) {
            resource.expanded = !resource.expanded;
        }
        this.focusChanged.next(resource);
    }

    getAll() {
        return this.resources.slice();
    }

    /**
     * Finds the resource with the given path.
     *
     * If the path begin with '/' the function will remove it from the path before
     * searching the resource.
     * @param path the path of the resource to search
     * @returns the resource or undefined
     */
    find(path: string): IResource {
        if (!path) {
            return undefined;
        }

        path = path.trim();
        if (path.startsWith('/')) {
            path = path.substring(1, path.length);
        }
        return this.findPredicate(item => item.path === path);
    }

    /**
     * Finds all the resources which meets the given predicate.
     *
     * If the predicate makes a path comparison be sure to remove '/' from the starts
     * of the path.
     * @param predicate the predicate to test
     */
    findAll(predicate: (resource: IResource) => boolean): IResource[] {
        return this.cache.filter(item => predicate(item));
    }

    /**
     * Finds the resource which meets the given predicate.
     *
     * If the predicate makes a path comparison be sure to remove '/' from the starts
     * of the path.
     * @param predicate the predicate to test
     */
    findPredicate(predicate: (resource: IResource) => boolean): IResource {
        return this.cache.find(r => predicate(r));
    }

    /**
     * Finds the resource at `path` relative to the path of the given `resource`.
     * @param resource the resource
     * @param path the path to find.
     * @returns A promise that resolves with the resource.
     */
    async findRelativeTo(resource: IResource, path: string) {
        try {
            this.task.emitTaskEvent(true, 'resolve path');
            const params = new HttpParams()
                .set('name', 'resolve_path')
                .set('path', resource.path)
                .set('target', path);
            const response = await this.http.get('filebrowser/option', { params: params, responseType: 'text' }).toPromise();
            this.task.emitTaskEvent(false);
            return this.find(response);
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * creates the resource on the server.
     * @param resource the resource object to create.
     * @returns Promise<boolean> rejected with an error or resolved with true.
     */
    async create(resource: IResource) {
        Asserts.checkName(resource.name);
        Asserts.assert(filters.canWrite(resource), 'permission denied: write access not granted for ' + resource.path);
        Asserts.assert(filters.canWrite(this.find(resource.parent)), 'permission denied: write access not granted for ' + resource.parent);

        this.task.emitTaskEvent(true, 'creating resource');
        try {
            const data = {
                name: 'create_resource',
                path: resource.parent + '/' + resource.name,
                content: resource.content,
                type: resource.type
            };
            const success = await this.edit(data, resource);
            this.task.emitTaskEvent(false);
            return success;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Renames the resource on the server.
     * @param resource the resource object to rename.
     * @param name the new name of the resource.
     * @returns Promise<boolean> resolved with true if the resource is renamed.
     */
    async rename(resource: IResource, name: string) {
        Asserts.checkName(name);
        Asserts.assert(filters.canWrite(resource), 'permission denied');
        Asserts.assert(!filters.isRoot(resource), 'cannot rename root directory');

        if (name === resource.name) {
            return Promise.resolve(true);
        }

        try {
            let success = false;
            this.task.emitTaskEvent(true, 'rename');
            const data = {
                name: 'rename_resource',
                path: resource.path,
                target: name,
            };
            success = await this.edit(data, resource);
            this.task.emitTaskEvent(false);
            return success;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Deletes the resource object from the server.
     * @param resource the resource object to deletes.
     * @returns Promise<boolean> resolved with true or false and rejected with an error
     */
    async delete(resource: IResource) {
        try {
            Asserts.requireNonNull(resource, 'resource');
            Asserts.assert(filters.canWrite(resource), 'permission denied');
            Asserts.assert(!filters.isRoot(resource), 'permission denied');
            this.task.emitTaskEvent(true, 'delete');
            const headers = new HttpHeaders().set('Content-Type', 'application/json;charset=UTF-8');
            await this.http.post('filebrowser/option', {
                name: 'delete_resource',
                path: resource.path
            }, { headers: headers }).toPromise();

            const success = this.remove(resource.path);
            this.task.emitTaskEvent(false);
            this.git.refresh();
            return success;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Moves the file|resource 'src' to the resource 'dst'.
     * @param src the source file or resource
     * @param dst the destination resource
     * @returns Promise<boolean> rejected with a string error message or resolved with true
     */
    async move(src: IResource | File, dst: IResource) {
        try {
            this.task.emitTaskEvent(true, 'move');
            Asserts.requireNonNull(src, 'src');
            Asserts.requireNonNull(dst, 'dst');
            Asserts.assert(filters.canWrite(dst), 'permission denied');
            Asserts.assert(filters.isFolder(dst), 'destination must be a directory');

            let resource: IResource;
            if ('size' in src) { // File type contains size property
                resource = await this.drop(src as unknown as File, dst);
            } else {
                resource = await this.drag(src as unknown as IResource, dst);
            }
            this.sort(dst.children);
            dst.expanded = true;
            this.focus(resource);
            this.changed.next(this.getAll());
            this.task.emitTaskEvent(false);
            this.git.refresh();
            return true;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Saves the content of the resource on the server
     * @param resource the resource
     * @returns Promise<boolean> resolved with true and rejected with an error
     */
    async save(resource: IResource) {
        if (!resource.changed) {
            return true;
        }
        try {
            this.task.emitTaskEvent(true, 'save');
            Asserts.requireNonNull(resource, 'resource');
            const headers = new HttpHeaders().set('Content-Type', 'application/json;charset=UTF-8');
            await this.http.post('filebrowser/option', {
                name: 'update_resource', path: resource.path, content: resource.content
            }, { headers: headers }).toPromise();
            resource.changed = false;
            resource.savedContent = resource.content;
            this.task.emitTaskEvent(false);
            this.git.refresh();
            return true;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Downloads the folder as a zip archive
     * @param resource the resource
     * @throws {ReferenceError} if resource is null or undefined.
     * @throws {TypeError} if resource is not a folder.
     * @returns Promise<void> resolved with true and rejected with an error
     */
    async download(resource: IResource) {
        Asserts.requireNonNull(resource, 'resource');
        Asserts.assert(resource.type === ResourceTypes.Folder);
        try {
            this.task.emitTaskEvent(true);
            const params = new HttpParams().set('name', 'download_resource').set('path', resource.path);
            await this.http.get('filebrowser/option', { params: params }).toPromise();
            this.task.emitTaskEvent(false);
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Opens the content of the resource on the server (if not already opened)
     * @param resource the resource
     * @returns Promise<boolean> resolved with true or false and rejected with an error
     */
    async open(resource: IResource) {
        this.focus(resource);
        if (resource.type === ResourceTypes.Folder) {
            resource.expanded = !resource.expanded;
            return true;
        }

        if (filters.isLoaded(resource) && !resource.dirty) {
            return true;
        }

        try {
            this.task.emitTaskEvent(true, 'retrieving resource content');

            const params = new HttpParams().set('name', 'get_resource').set('path', resource.path);
            const response = await this.http.get('filebrowser/option', { params: params }).toPromise();
            resource.meta = response['meta'];
            resource.content = resource.savedContent = response['content'];
            resource.changed = resource.dirty = false;

            this.task.emitTaskEvent(false);
            return true;
        } catch (error) {
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    /**
     * Reloads the resources from the server.
     * @returns A promise that resolves with true
     */
    async refresh() {
        try {
            this.task.emitTaskEvent(true, 'retrieving resources');
            const params = new HttpParams().set('name', 'get_resources');
            const resources = await this.http.get<IResource[]>('/filebrowser/option', { params: params }).toPromise();
            if (resources.length > 0) {
                this.sort(resources);
            }
            await this.build(resources);
            this.changed.next(this.resources.slice());
            this.task.emitTaskEvent(false);
            return true;
        } catch (error) {
            this.resources = [];
            this.changed.next(this.resources.slice());
            this.task.emitTaskEvent(false);
            throw error;
        }
    }

    private async build(resources: IResource[]) {
        const cache = [];
        async function recursive(item: IResource) {
            cache.push(item);
            if (item.children) {
                for (const child of item.children) {
                    await recursive(child);
                }
            }
        }
        for (const root of resources) {
            await recursive(root);
        }
        this.cache = cache;
        this.resources = resources;
        this.git.refresh();
    }

    private async edit(data: any, resource: IResource) {
        const headers = new HttpHeaders().set('Content-Type', 'application/json;charset=UTF-8');
        const response = await this.http.post('filebrowser/option', data, {
            headers: headers
        }).toPromise();

        const parent = this.find(resource.parent);
        parent.children = parent.children || [];
        const after = response['path'];
        const before = resource.path;
        if (resource.renaming) {
            resource.name = basename(after);
            this.replace(before, after);
        } else {
            resource.path = after;
            parent.children.push(resource);
            this.cache.push(resource);
            this.created.next(resource);
        }

        resource.renaming = false;
        resource.creating = false;

        this.git.refresh();
        this.sort(parent.children);

        this.changed.next(this.getAll());
        return true;
    }

    private async drop(src: File, dst: IResource) {
        Asserts.requireNonNull(src.name, 'src.name');
        Asserts.requireNonNull(dst.path, 'dst.path');
        Asserts.checkName(src.name);
        const formData = new FormData();
        formData.append('file', src, src.name);
        formData.append('path', dst.path);
        const headers = new HttpHeaders();
        headers.set('Content-Type', null);
        headers.set('Accept', 'multipart/form-data');
        await this.http.post('/filebrowser/upload_resource', formData, { headers: headers }).toPromise();
        const newRes = createResource(dst, ResourceTypes.File);
        newRes.path = dst.path + '/' + src.name;
        newRes.name = src.name;
        newRes.renaming = newRes.creating = false;
        dst.children = dst.children || [];
        dst.children.push(newRes);
        this.cache.push(newRes);
        return newRes;
    }

    private async drag(src: IResource, dst: IResource) {
        Asserts.requireNonNull(src.path, 'src.path');
        Asserts.requireNonNull(dst.path, 'dst.path');
        Asserts.assert(src.path !== dst.path, 'cannot move the resource to the same path');
        Asserts.assert(!filters.isRoot(src), 'cannot move a root resource');

        const headers = new HttpHeaders().set('Content-Type', 'application/json;charset=UTF-8');
        const response = await this.http.post('filebrowser/option', {
            name: 'move_resource',
            path: src.path,
            dst: dst.path
        }, { headers: headers }).toPromise();

        const before = src.path;
        const after = response['path'];
        const parent = this.find(src.parent);
        parent.children = parent.children.filter(item => item.path !== src.path);

        src.parent = dst.path;
        src.path = after;
        dst.children.push(src);
        this.replace(before, after);
        return src;
    }


    private replace(oldPath: string, newPath: string) {
        const that = this;
        function doAction(item: IResource) {
            if (item.path.startsWith(oldPath)) {
                const before = item.path;
                item.path = before.replace(oldPath, newPath);
                that.renamed.next({ before: before, after: item.path });
            }
            if (item.parent.startsWith(oldPath)) {
                item.parent = item.parent.replace(oldPath, newPath);
            }
        }
        for (const item of this.cache) {
            doAction(item);
        }
    }

    private remove(path: string) {
        path = path.trim();
        const toRemove = this.find(path);
        if (!toRemove) {
            return false;
        }
        const p = this.find(toRemove.parent);
        if (!p) {
            return false;
        }
        const index = p.children.findIndex(e => e.path === path);
        if (index === -1) {
            return false;
        }
        p.children.splice(index, 1);
        this.cache = this.cache.filter(e => e.path !== path);


        function propagate(item: IResource, subject: Subject<IResource>) {
            subject.next(item);
            if (item.children) {
                item.children.forEach(child => propagate(child, subject));
            }
        }
        propagate(toRemove, this.deleted);
        this.changed.next(this.resources.slice());
        return true;
    }

    private sort(resources: IResource[]) {
        if (resources) {
            resources.sort((a: IResource, b: IResource) => {
                if (a.type === b.type) {
                    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
                }
                return a.type === 'folder' ? -1 : 1;
            });
            for (const item of resources) {
                this.sort(item.children);
            }
        }
    }

}
