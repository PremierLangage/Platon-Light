import os

import django
from channels.auth import AuthMiddlewareStack
from channels.http import AsgiHandler
from channels.routing import ProtocolTypeRouter, URLRouter

from activity.urls import websocket_urlpatterns as activity_websocket_urlpatterns

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'premierlangage.settings')
django.setup()

application = ProtocolTypeRouter({
  "http": AsgiHandler(),
  # Just HTTP for now. (We can add other protocols later.)
  "websocket": AuthMiddlewareStack(
        URLRouter(
            activity_websocket_urlpatterns
        )
    ),
})