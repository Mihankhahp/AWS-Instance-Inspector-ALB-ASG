import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

class IamConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
      ],
    });

    // Read-only access for /api/cluster + write access for CW agent (logs + metrics).
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'autoscaling:DescribeAutoScalingGroups',
          'autoscaling:DescribeAutoScalingInstances',
          'autoscaling:DescribeScalingActivities',
          'cloudwatch:GetMetricData',
          'ec2:DescribeInstances',
        ],
        resources: ['*'],
      }),
    );

    this.instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
    );
  }
}

export { IamConstruct };
