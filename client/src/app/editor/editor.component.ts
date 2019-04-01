import { Component, ViewEncapsulation, HostListener, OnInit } from '@angular/core';

import { IResource } from './shared/models/resource.model';

import { TaskService } from './shared/services/core/task.service';
import { MonacoService } from './shared/services/monaco/monaco.service';
import { OpenerService } from './shared/services/core/opener.service';
import { ResourceService } from './shared/services/core/resource.service';
import { NotificationService } from '../shared/services/notification.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class EditorComponent implements OnInit {

    showQuickOpen: boolean;

    constructor(
        private readonly task: TaskService,
        private readonly opener: OpenerService,
        private readonly monaco: MonacoService,
        private readonly resources: ResourceService,
        private readonly notification: NotificationService,
    ) {}

    ngOnInit(): void {
        this.resources.refresh().catch(error => {
            this.notification.logError(error);
        });
    }


    items(): IResource[] {
        return this.resources.resources;
    }

    querying() {
        return this.task.running;
    }

    @HostListener('window:beforeunload', ['$event'])
    beforeunload($event: any) {
        if (this.resources.changed()) { // the if is required
            $event.returnValue = true;
        }
    }

    @HostListener('document:keydown', ['$event'])
    keypressed($event: KeyboardEvent) {
        if ($event.ctrlKey && $event.key === 'o') {
            $event.preventDefault();
            $event.stopPropagation();
            this.showQuickOpen = true;
        }
    }

}
