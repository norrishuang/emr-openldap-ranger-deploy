import boto3
import json
import urllib.request
import traceback

def send_response(event, context, response_status, response_data, physical_resource_id=None):
    response_body = {
        'Status': response_status,
        'Reason': f'See the details in CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': physical_resource_id or context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'NoEcho': True,  # Set NoEcho to True to avoid logging sensitive information
        'Data': response_data
    }

    json_response_body = json.dumps(response_body)

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        req = urllib.request.Request(
            event['ResponseURL'],
            data=json_response_body.encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        with urllib.request.urlopen(req) as response:
            print(f"Status code: {response.status}")
            print(f"Status message: {response.reason}")
    except Exception as e:
        print(f"Failed to send response: {str(e)}")

def handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    ec2 = boto3.client('ec2')
    
    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        key_pair_name = properties['KeyPairName']
        
        if request_type == 'Create':
            print(f"Creating key pair: {key_pair_name}")
            response = ec2.create_key_pair(KeyName=key_pair_name)
            private_key = response['KeyMaterial']
            key_pair_id = response['KeyPairId']
            
            print(f"Key pair created successfully. ID: {key_pair_id}")
            send_response(event, context, 'SUCCESS', {
                'PrivateKey': private_key,
                'KeyPairId': key_pair_id
            }, physical_resource_id=key_pair_id)
        
        elif request_type == 'Update':
            old_physical_resource_id = event['PhysicalResourceId']
            
            print(f"Deleting old key pair: {old_physical_resource_id}")
            ec2.delete_key_pair(KeyPairId=old_physical_resource_id)
            
            print(f"Creating new key pair: {key_pair_name}")
            response = ec2.create_key_pair(KeyName=key_pair_name)
            private_key = response['KeyMaterial']
            key_pair_id = response['KeyPairId']
            
            print(f"Key pair updated successfully. New ID: {key_pair_id}")
            send_response(event, context, 'SUCCESS', {
                'PrivateKey': private_key,
                'KeyPairId': key_pair_id
            }, physical_resource_id=key_pair_id)
        
        elif request_type == 'Delete':
            physical_resource_id = event['PhysicalResourceId']
            print(f"Deleting key pair: {physical_resource_id}")
            ec2.delete_key_pair(KeyPairId=physical_resource_id)
            print("Key pair deleted successfully")
            send_response(event, context, 'SUCCESS', {}, physical_resource_id=physical_resource_id)
    
    except Exception as e:
        print(f"Error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        send_response(event, context, 'FAILED', {}, physical_resource_id=event.get('PhysicalResourceId', 'could-not-create'))
