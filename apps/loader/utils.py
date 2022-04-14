import os

from django.conf import settings
from sympy import Abs



def get_location(directory, path, current="", parser=None):
    """Returns a tuple (directory, path)
       
       params:
           - directory: [Directory] Directory containing the currently parsed file
           - path:      [str]       Path to the file needed
           - current:   [str]       Current position relative to directory
        
       returns:
           Return a tuple (directory_name, path)
        
       raises:
           - SyntaxError if a directory is given but the path after ':' isn't absolute or if '~\' is
             used outside repository.
           - FileNotFoundError is either the library or the file does not exists."""
    print("get_location", path, directory)
    if ':' in path:  # Relative to a library
        lib, path = path.split(':')
        if lib.isdigit():
            raise SyntaxError("Library's name cannot be an integer")
        if not path.startswith('/'):
            raise SyntaxError("Syntax Error (path after ':' must be absolute)")
        path = path[1:]
        absolute = os.path.join(settings.FILEBROWSER_ROOT, lib)
        if not os.path.isdir(absolute):
            raise FileNotFoundError("Library '%s' does not exists" % lib)
        absolute = os.path.join(absolute, path)
        if not os.path.isfile(absolute):
            raise FileNotFoundError("File '%s' does not exists in library '%s'" % (path, lib))
        return lib, os.path.normpath(path)
    
    if path.startswith('/'):
        path = path[1:]
        absolute = os.path.join(directory.root, path)
        if not os.path.isfile(absolute):
            for lib in [i for i in os.listdir(settings.FILEBROWSER_ROOT) if
                        i != settings.HOME]:  # pragma: no cover
                absolute = os.path.join(settings.FILEBROWSER_ROOT, lib, path)
                if os.path.isfile(absolute):
                    return lib, path
            raise FileNotFoundError("File '%s' does not exist" % path)
        return directory.name, os.path.normpath(path)
    
    if path.startswith('~/'):  # Relative to user's home
        path = path[2:]
        absolute = os.path.join(directory.root, path)
        if not os.path.isfile(absolute):
            raise FileNotFoundError("File '%s' does not exists" % path)
        return directory.name, os.path.normpath(path)
    
    # Relative to current file
    absolute = os.path.join(directory.root, current, path)
    if not os.path.isfile(absolute):
        raise FileNotFoundError("File '%s' does not exists" % path)
    return directory.name, os.path.normpath(os.path.join(current, path))



def extends_dict(target, source):
    """ Will copy every key and value of source in target if key is not present in target """
    for key, value in source.items():
        if key not in target:
            target[key] = value
        elif type(target[key]) is dict:
            extends_dict(target[key], value)
        elif type(target[key]) is list:
            target[key] += value
    
    return target



def displayed_path(path):
    path = path.replace(settings.FILEBROWSER_ROOT, '')
    p = [i for i in path.split('/') if i]
    if p[0].isdigit():
        p[0] = 'home'
    
    return os.path.join(*p)
