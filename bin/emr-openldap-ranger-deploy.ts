#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EmrOpenldapRangerDeployStack } from '../lib/emr-openldap-ranger-deploy-stack';

const app = new cdk.App();
new EmrOpenldapRangerDeployStack(app, 'EmrOpenldapRangerDeployStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
