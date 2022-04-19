# activity/consumers.py
import json
from channels.generic.websocket import WebsocketConsumer

class ActivityConsumer(WebsocketConsumer):
    def connect(self):
        print("Websocket :", "connect")
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