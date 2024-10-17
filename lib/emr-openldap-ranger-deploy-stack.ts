import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as emr from 'aws-cdk-lib/aws-emr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';


export class EmrOpenldapRangerDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Retrieve environment variables
    const vpcId = process.env.VPC_ID;
    console.log("VPC ID:" + vpcId)
    const region = process.env.AWS_REGION || this.region;

    // // Create the custom resource for key pair
    const keyPairName = 'my-ec2-key-pair';

    const keyPairSecret = secretsmanager.Secret.fromSecretNameV2(this, 'MySecret', 'ec2-keypair-secret');

    let vpc: ec2.IVpc;
    if (vpcId) {
      // If VPC ID is provided, use the existing VPC
      vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', { vpcId: vpcId });
    } else {
      // If VPC ID is not provided, create a new VPC
      vpc = new ec2.Vpc(this, 'NewVPC', {
        maxAzs: 3,
        cidr: '10.0.0.0/16',
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          }
        ],
        natGateways: 1
      });
    }


    // Create a new security group for both RDS and EMR
    const sharedSecurityGroup = new ec2.SecurityGroup(this, 'SharedSecurityGroup', {
      vpc,
      description: 'Security group shared by RDS and EMR',
      allowAllOutbound: true,
    });

    sharedSecurityGroup.addIngressRule(
      sharedSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow all traffic from resources within the security group'
    );

    sharedSecurityGroup.addIngressRule(
      sharedSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow MySQL traffic from EMR cluster'
    );

    // Create an IAM user
    const myuser = new iam.User(this, 'MyIAMUser', {
      userName: 'emr-deploy-user',
    });

    // Attach AdministratorAccess policy to the user
    myuser.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    // const MyIAMUserAccessKey = new iam.AccessKey(this, 'MyIAMUserAccessKey', {
    //   user: myuser,
    // });

    const MyIAMUserAccessKey = new iam.CfnAccessKey(this, 'MyIAMUserAccessKey', {
      userName: myuser.userName,
    });

    const accessKeySecret = new secretsmanager.Secret(this, 'AccessKeySecret', {
      secretName: 'my-iam-user-credentials',
      description: 'Access key and secret key for IAM user',
      secretObjectValue: {
        accessKeyId: cdk.SecretValue.unsafePlainText(MyIAMUserAccessKey.ref),
        secretAccessKey: cdk.SecretValue.unsafePlainText(MyIAMUserAccessKey.attrSecretAccessKey),
      },
        // excludeCharacters: '0oO1lI', // Exclude easily confused characters
        // passwordLength: 32, // Set the length of the secret key
        // requireEachIncludedType: true, // Require at least one of each included type
        // includeSpace: false, // Don't include spaces
    });

    // Create a new key pair
    // const keyPair = new ec2.KeyPair(this, 'MyKeyPair', {
    //   keyPairName: 'my-ec2-key-pair',
    //   type: ec2.KeyPairType.RSA,
    //   format: ec2.KeyPairFormat.PEM,
    // });

    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keyPairName);

    // Create a secret for RDS credentials
    const rdsSecret = new secretsmanager.Secret(this, 'RDSCredentials', {
      secretName: 'rds-emr-hive-metadata-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    // Create MySQL RDS instance for external metadata
    const dbInstance = new rds.DatabaseInstance(this, 'MyRDSInstance', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sharedSecurityGroup],
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      databaseName: 'hive',
      credentials: rds.Credentials.fromSecret(rdsSecret),
    });


    // Create EMR cluster
    const cluster = new emr.CfnCluster(this, 'MyEMRCluster', {
      name: 'MyMultiMasterEMRCluster',
      releaseLabel: 'emr-7.3.0',
      applications: [
        // { name: 'Spark' },
        { name: 'Hive' },
        { name: 'Tez' },
        { name: 'Trino' },
        { name: 'Hue' },
        { name: 'Oozie' }
      ],
      configurations: [
        {
          classification: 'hive-site',
          configurationProperties: {
            'javax.jdo.option.ConnectionURL': `jdbc:mysql://${dbInstance.dbInstanceEndpointAddress}:${dbInstance.dbInstanceEndpointPort}/hive?createDatabaseIfNotExist=true`,
            'javax.jdo.option.ConnectionDriverName': 'org.mariadb.jdbc.Driver',
            'javax.jdo.option.ConnectionUserName': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:username}}`,
            'javax.jdo.option.ConnectionPassword': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:password}}`,
          },
        },
        {
          classification: "oozie-site",
          configurationProperties: {
                "oozie.service.JPAService.jdbc.driver": "org.mariadb.jdbc.Driver",
                "oozie.service.JPAService.jdbc.url": `jdbc:mysql://${dbInstance.dbInstanceEndpointAddress}:${dbInstance.dbInstanceEndpointPort}/oozie?createDatabaseIfNotExist=true`,                               
                "oozie.service.JPAService.jdbc.username": `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:username}}`,
                "oozie.service.JPAService.jdbc.password": `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:password}}`,
            }
        },
        {
          classification: "hue-ini",
          configurations: [
            {
              classification: "desktop",
              configurationProperties: {},
              configurations: [
                {
                  classification: "database",
                  configurationProperties: {
                    'engine': 'mysql',
                    'host': `${dbInstance.dbInstanceEndpointAddress}`,
                    'port': `${dbInstance.dbInstanceEndpointPort}`,
                    'user': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:username}}`,
                    'password': `{{resolve:secretsmanager:${rdsSecret.secretArn}:SecretString:password}}`,
                    'name': 'hive'
                  }
                }
              ]
            }
          ]
        },
      ],
      instances: {
        masterInstanceGroup: {
          instanceCount: 3,  // This creates a multi-master setup
          instanceType: 'm5.xlarge',
        },
        coreInstanceGroup: {
          instanceCount: 3,
          instanceType: 'm5.xlarge',
        },
        ec2KeyName: keyPairName,
        ec2SubnetIds: [
          vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds[0],
        ],
        additionalMasterSecurityGroups: [sharedSecurityGroup.securityGroupId],
        additionalSlaveSecurityGroups: [sharedSecurityGroup.securityGroupId],
        terminationProtected: false,
      },
      jobFlowRole: 'EMR_EC2_DefaultRole',
      serviceRole: 'EMR_DefaultRole',
      visibleToAllUsers: true,
      logUri: `s3://aws-logs-${this.account}-${this.region}/${this.stackName}/emr-logs/`,
    });

    const clusterId = cluster.ref

    
    const ec2Role = new iam.Role(this, 'EC2InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    
    // Add additional permissions if needed
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'));
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEMRFullAccessPolicy_v2'));

    // Create the EC2 instance
    const instance = new ec2.Instance(this, 'OpenLDAP_Ranger_Instance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.XLARGE),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: sharedSecurityGroup,
      role: ec2Role,
      keyPair: keyPair,
      blockDevices: [
        {
          deviceName: '/dev/xvda', // Root volume
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      userData: ec2.UserData.forLinux(),
    });

    // instance.node.addDependency(keyPairCustomResource);
    // Grant the instance permission to read the secret
    // Grant permission to read the specific secret
    // keyPairSecret.grantRead(ec2Role);
    // accessKeySecret.grantRead(ec2Role);

    // Define user data (bootstrap script)
    instance.addUserData(
      '#!/bin/bash',
      'set -e',
      'set -x',
      
      '# Update the system',
      'yum update -y',
      
      '# Install useful tools',
      'yum install -y amazon-cloudwatch-agent htop jq git',
      
      // 'sudo yum -y install git',
      // 'sudo yum -y install jq',\
      'cd /home/ec2-user/',
      'git clone https://github.com/norrishuang/ranger-emr-cli-installer.git',

      `export REGION=${this.region}`,
      `SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id ${accessKeySecret.secretArn} --region ${this.region} --query SecretString --output text)`,
      'ACCESS_KEY_ID=$(echo $SECRET_JSON | jq -r .accessKeyId)',
      'SECRET_ACCESS_KEY=$(echo $SECRET_JSON | jq -r .secretAccessKey)',

      // Set the AKSK as environment variables
      // 'echo "export AWS_ACCESS_KEY_ID=$ACCESS_KEY_ID" >> /home/ec2-user/.bashrc',
      // 'echo "export AWS_SECRET_ACCESS_KEY=\"$SECRET_ACCESS_KEY\"" >> /home/ec2-user/.bashrc',
      // Retrieve and save the private key
      // `aws secretsmanager get-secret-value --secret-id ${accessKeySecret.secretArn} --region ${this.region} --query SecretString --output text | jq -r .privatekey > /home/ec2-user/my-ec2-key-pair.pem`,
      `aws secretsmanager get-secret-value --secret-id ${keyPairSecret.secretName} --region ${this.region} --query SecretString --output text > /home/ec2-user/my-ec2-key-pair.pem`,
      'chmod 400 /home/ec2-user/my-ec2-key-pair.pem',
      'SSH_KEY=/home/ec2-user/my-ec2-key-pair.pem',
      'export OPENLDAP_HOST=`hostname`',

      'sudo sh ./ranger-emr-cli-installer/bin/setup.sh install \\',
      '  --region "$REGION" \\',
      '  --access-key-id \""$ACCESS_KEY_ID"\" \\',
      '  --secret-access-key \""$SECRET_ACCESS_KEY\"" \\',
      '  --ssh-key "$SSH_KEY" \\',
      '  --solution \'open-source\' \\',
      '  --auth-provider \'openldap\' \\',
      '  --openldap-host "$OPENLDAP_HOST" \\',
      '  --openldap-base-dn \'dc=example,dc=com\' \\',
      '  --openldap-root-cn \'admin\' \\',
      '  --openldap-root-password \'Admin1234!\' \\',
      '  --openldap-user-dn-pattern \'uid={0},ou=users,dc=example,dc=com\' \\',
      '  --openldap-group-search-filter \'(member=uid={0},ou=users,dc=example,dc=com)\' \\',
      '  --openldap-user-object-class \'inetOrgPerson\' \\',
      '  --example-users \'example-user-1,example-user-2\' \\',
      '  --ranger-plugins \'open-source-hdfs,open-source-metastore,open-source-yarn\' \\',
      `  --emr-cluster-id ${clusterId} \\`,
      '  --auto-confirm \'true\''
    );


    // Output the instance public IP
    new cdk.CfnOutput(this, 'InstancePublicIP', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });

    // Output the key pair ID and secret ARN
    // new cdk.CfnOutput(this, 'KeyPairId', {
    //   value: keyPairId,
    //   description: 'ID of the EC2 Key Pair',
    // });

    new cdk.CfnOutput(this, 'KeyPairSecretArn', {
      value: keyPairSecret.secretArn,
      description: 'ARN of the secret containing the private key',
    });

    // Output the EMR cluster ID
    new cdk.CfnOutput(this, 'EMRClusterID', {
      value: cluster.ref,
      description: 'ID of the EMR cluster',
    });

    // Output the Secret ARN
    new cdk.CfnOutput(this, 'RDSSecretArn', {
      value: rdsSecret.secretArn,
      description: 'ARN of the secret containing RDS credentials',
    });

    // Output the Secret ARN
    new cdk.CfnOutput(this, 'IAM User credentials', {
      value: accessKeySecret.secretArn,
      description: 'ARN of the secret containing IAM User credentials',
    });


    // Output the RDS endpoint
    new cdk.CfnOutput(this, 'RDSEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'Endpoint of the RDS instance',
    });
  }
}
