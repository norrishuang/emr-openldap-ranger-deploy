# Aamzon EMR Multi-Master with Open LDAP and Apache Ranger

This Project is for deploy a solution of use *OpenLDAP + Apache Ranger* to fine-grainedly control user access rights.

It will create a RDS for hive metastore, a EMR Cluster, and a EC2 instance for install Open LDAP and Apache Ranger.

It's a CDK script, will help you deploy the solution simple and quickly.

---

#### Version
Update 2024-11-25
* Add an EC23 instance for install phpLDAPAdmin

---

#### Deployment


```shell
git clone https://github.com/norrishuang/emr-openldap-ranger-deploy.git
cd emr-openldap-ranger-deploy

cdk bootstrap

# if you have a exists vpc, else it will create a new VPC include 3 public subnets and 3 private subnets.
export VPC_ID=<vpc-xxxxx>
cdk deploy --all --require-approval never
```

**Include Resources:**

* VPC
* RDS
* EMR
* EC2 for install Open LDAP, phpLDAPAdmin and Apache Ranger

![image](./images/architecture.png)

When deloyment finished, There is a URL for Apache Ranger UI in output of CDK stack.

```bash
http://<ranger-instance-host>:6080
```
