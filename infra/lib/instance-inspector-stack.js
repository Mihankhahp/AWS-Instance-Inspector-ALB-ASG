import * as cdk from 'aws-cdk-lib';
import { NetworkingConstruct } from './constructs/networking.js';
import { IamConstruct } from './constructs/iam.js';
import { StorageConstruct } from './constructs/storage.js';
import { LoadBalancerConstruct } from './constructs/load-balancer.js';
import { ComputeConstruct } from './constructs/compute.js';
import { AlertingConstruct } from './constructs/alerting.js';
import { ObservabilityConstruct } from './constructs/observability.js';

class InstanceInspectorStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const adminEmail = this.node.tryGetContext('adminEmail');
    if (!adminEmail) {
      throw new Error(
        'Missing required context: adminEmail\n' +
          'Deploy with: cdk deploy -c adminEmail=you@example.com',
      );
    }

    const networking = new NetworkingConstruct(this, 'Networking');

    const iam = new IamConstruct(this, 'Iam');

    const storage = new StorageConstruct(this, 'Storage', {
      frontendInstanceRole: iam.frontendInstanceRole,
      backendInstanceRole: iam.backendInstanceRole,
    });

    const loadBalancer = new LoadBalancerConstruct(this, 'LoadBalancer', {
      vpc: networking.vpc,
      albSg: networking.albSg,
    });

    const compute = new ComputeConstruct(this, 'Compute', {
      vpc: networking.vpc,
      frontendSg: networking.frontendSg,
      backendSg: networking.backendSg,
      frontendInstanceRole: iam.frontendInstanceRole,
      backendInstanceRole: iam.backendInstanceRole,
      frontendBucket: storage.frontendBucket,
      backendBucket: storage.backendBucket,
      frontendTg: loadBalancer.frontendTg,
      backendTg: loadBalancer.backendTg,
      alb: loadBalancer.alb,
      frontendDeployment: storage.frontendDeployment,
      backendDeployment: storage.backendDeployment,
    });

    const alerting = new AlertingConstruct(this, 'Alerting', {
      adminEmail,
      frontendAsg: compute.frontendAsg,
      backendAsg: compute.backendAsg,
    });

    new ObservabilityConstruct(this, 'Observability', {
      alb: loadBalancer.alb,
      frontendTg: loadBalancer.frontendTg,
      backendTg: loadBalancer.backendTg,
      frontendAsg: compute.frontendAsg,
      backendAsg: compute.backendAsg,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: loadBalancer.alb.loadBalancerDnsName,
      description:
        'Open this in your browser — traffic will round-robin across instances',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `http://${loadBalancer.alb.loadBalancerDnsName}/api/info`,
      description: 'Instance metadata endpoint',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=InstanceInspector`,
      description: 'CloudWatch Observability Dashboard',
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alerting.alertTopic.topicArn,
      description:
        'SNS topic that emails the admin on every Auto Scaling event',
    });
  }
}

export { InstanceInspectorStack };
