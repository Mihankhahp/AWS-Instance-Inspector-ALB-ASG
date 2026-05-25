import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

class NetworkingConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: 'Allow HTTP from internet to ALB',
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from internet',
    );

    this.frontendSg = new ec2.SecurityGroup(this, 'FrontendSg', {
      vpc: this.vpc,
      description: 'Allow traffic from ALB to frontend instances',
      allowAllOutbound: true,
    });
    this.frontendSg.addIngressRule(
      this.albSg,
      ec2.Port.tcp(3000),
      'From ALB to Nginx',
    );

    this.backendSg = new ec2.SecurityGroup(this, 'BackendSg', {
      vpc: this.vpc,
      description: 'Allow traffic from ALB to backend instances',
      allowAllOutbound: true,
    });
    this.backendSg.addIngressRule(
      this.albSg,
      ec2.Port.tcp(4000),
      'From ALB to Express',
    );
  }
}

export { NetworkingConstruct };
