# Aamzon EMR Multi-Master with Open LDAP and Apache Ranger

This Repo is for deploy a solution of use *OpenLDAP + Apache Ranger* to fine-grainedly control user access rights.

It will create a RDS for hive metastore, a EMR Cluster, and a EC2 instance for install Open LDAP and Apache Ranger.

It's a CDK script, will help you deploy the solution simple and quickly.

**Include Resources:**
* VPC
* RDS
* EMR
* EC2 for install Open LDAP and Apache Ranger




# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
