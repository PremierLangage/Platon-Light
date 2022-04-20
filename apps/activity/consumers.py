# activity/consumers.py
import json
from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer

class ActivityConsumer(WebsocketConsumer):
    def connect(self):
        
        self.activity_id = self.scope['url_route']['kwargs']['activity_id']
        self.username = self.scope['url_route']['kwargs']['username']
        self.group_name = f"{self.activity_id}_{self.username}"
        
        # Join room group
        async_to_sync(self.channel_layer.group_add)(
            self.group_name,
            self.group_name
        )
        self.accept()

    def disconnect(self, close_code):
        pass

    def receive(self, text_data):
        print("RECEIVE FONCTION", text_data)
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        print("Websocket :", message)
        self.send(text_data=json.dumps({
            'message': message
        }))