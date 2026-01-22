#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EmrOpenldapRangerDeployStack } from '../lib/emr-openldap-ranger-deploy-stack';
import { EmrOpenldapRangerEMRNativeDeployStack } from '../lib/emr-openldap-ranger-deploy-stack-emr-native';
import { EmrOpenldapRangerCreateKeypair } from '../lib/emr-openldap-ranger-create-keypair';

const app = new cdk.App();

// Get deployment type from environment variable or CDK context
// Priority: Environment variable > CDK context > default (opensource)
const deploymentType = process.env.DEPLOYMENT_TYPE || 
                       app.node.tryGetContext('deploymentType') || 
                       'opensource';

// Validate deployment type
if (!['opensource', 'emr-native'].includes(deploymentType)) {
  throw new Error(`Invalid DEPLOYMENT_TYPE: ${deploymentType}. Must be 'opensource' or 'emr-native'`);
}

console.log(`Deploying with type: ${deploymentType}`);

const keypairStack = new EmrOpenldapRangerCreateKeypair(app, 'EmrOpenldapRangerCreateKeypair', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});

// Deploy the appropriate stack based on deployment type
let DeployStack;
if (deploymentType === 'emr-native') {
  DeployStack = new EmrOpenldapRangerEMRNativeDeployStack(app, 'EmrOpenldapRangerEMRNativeDeployStack', {
    env: { 
      account: process.env.CDK_DEFAULT_ACCOUNT, 
      region: process.env.CDK_DEFAULT_REGION 
    },
  });
} else {
  DeployStack = new EmrOpenldapRangerDeployStack(app, 'EmrOpenldapRangerDeployStack', {
    env: { 
      account: process.env.CDK_DEFAULT_ACCOUNT, 
      region: process.env.CDK_DEFAULT_REGION 
    },
  });
}

DeployStack.node.addDependency(keypairStack);