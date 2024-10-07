#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EmrOpenldapRangerDeployStack } from '../lib/emr-openldap-ranger-deploy-stack';
import { EmrOpenldapRangerCreateKeypair } from '../lib/emr-openldap-ranger-create-keypair';

const app = new cdk.App();


const keypairStack = new EmrOpenldapRangerCreateKeypair(app, 'EmrOpenldapRangerCreateKeypair', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});

const DeployStack = new EmrOpenldapRangerDeployStack(app, 'EmrOpenldapRangerDeployStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});

DeployStack.node.addDependency(keypairStack);