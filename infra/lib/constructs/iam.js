import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

class IamConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const sharedPolicies = [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
    ];

    // Frontend instances only need SSM access and the CW agent for log shipping.
    this.frontendInstanceRole = new iam.Role(this, 'FrontendInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: sharedPolicies,
    });

    // Backend instances additionally call ASG/CloudWatch APIs for /api/cluster.
    this.backendInstanceRole = new iam.Role(this, 'BackendInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: sharedPolicies,
    });

    this.backendInstanceRole.addToPolicy(
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
  }
}

export { IamConstruct };
