# activity/consumers.py
import json
from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer
from django.http import JsonResponse

from activity.models import Activity,SessionActivity

class ActivityConsumer(WebsocketConsumer):
    
    secondary_connection = False
    
    def connect(self):
        activity = Activity.objects.get(id=self.scope['url_route']['kwargs']['activity_id'])
        user = self.scope["user"]
        if user.is_authenticated: 
            self.sessionActivity = SessionActivity.objects.get(activity=activity,user=user)
            self.group_name = activity.name
            self.channel_name = f"{user.username}"
            print("CONNECT", self.sessionActivity, self.sessionActivity.connection_flag)
            if not self.sessionActivity.connection_flag:
                # Join room group
                async_to_sync(self.channel_layer.group_add)(
                self.group_name,
                self.channel_name
                )
                self.sessionActivity.connection_flag = True
                self.sessionActivity.save()
                self.accept()
            else:
                print("DEBUG", "ALREADY CNNECT MSSAGE SEND")
                self.secondary_connection = True
                self.accept()
                self.already_connect_message()
        else:
            self.sessionActivity = None
            print("User is not authenticated")            


    def disconnect(self, close_code):
        # Leave room group
        print("DEBUG", "DISCONNECT CONSUMER ", self.sessionActivity)        
        if self.sessionActivity and not self.secondary_connection:
            print("DEBUG", "PUT FLAG ON FALSE")
            async_to_sync(self.channel_layer.group_discard)(
                self.group_name,
                self.channel_name
            )
            self.sessionActivity.connection_flag = False
            self.sessionActivity.save()
        

    def receive(self, text_data):
        print("RECEIVE")
        text_data_json = json.loads(text_data)
        message = text_data_json['message']
        print("Websocket :", message)
        self.send(text_data=json.dumps({
            'message': message
        }))
        
        
    def already_connect_message(self):
        if self.secondary_connection:
            self.send(text_data=json.dumps({
                'already_connected': True
            }))
        