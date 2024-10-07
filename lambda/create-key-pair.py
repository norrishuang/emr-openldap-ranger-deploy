import boto3
import cfnresponse

def handler(event, context):
    ec2 = boto3.client('ec2')
    
    try:
        request_type = event['RequestType']
        properties = event['ResourceProperties']
        key_pair_name = properties['KeyPairName']
        
        if request_type == 'Create':
            response = ec2.create_key_pair(KeyName=key_pair_name)
            private_key = response['KeyMaterial']
            key_pair_id = response['KeyPairId']
            
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                'PrivateKey': private_key,
                'KeyPairId': key_pair_id
            }, physicalResourceId=key_pair_id)
        
        elif request_type == 'Update':
            # For updates, we'll create a new key pair and delete the old one
            old_physical_resource_id = event['PhysicalResourceId']
            
            # Create new key pair
            response = ec2.create_key_pair(KeyName=f"{key_pair_name}-new")
            private_key = response['KeyMaterial']
            key_pair_id = response['KeyPairId']
            
            # Delete old key pair
            ec2.delete_key_pair(KeyPairId=old_physical_resource_id)
            
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                'PrivateKey': private_key,
                'KeyPairId': key_pair_id
            }, physicalResourceId=key_pair_id)
        
        elif request_type == 'Delete':
            # Delete the key pair
            ec2.delete_key_pair(KeyPairId=event['PhysicalResourceId'])
            cfnresponse.send(event, context, cfnresponse.SUCCESS, {}, physicalResourceId=event['PhysicalResourceId'])
    
    except Exception as e:
        print(e)
        cfnresponse.send(event, context, cfnresponse.FAILED, {}, physicalResourceId=event.get('PhysicalResourceId', 'could-not-create'))
