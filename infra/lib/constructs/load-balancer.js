import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

class LoadBalancerConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const { vpc, albSg } = props;

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });

    this.frontendTg = new elbv2.ApplicationTargetGroup(this, 'FrontendTg', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      // Shortened from the 300s AWS default to match the simulator's drain feel.
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
      },
    });

    this.backendTg = new elbv2.ApplicationTargetGroup(this, 'BackendTg', {
      vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: '/api/health',
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200',
      },
    });

    // /api/* → backend (priority rule); all other traffic → frontend (default)
    this.listener = this.alb.addListener('HttpListener', {
      port: 80,
      defaultTargetGroups: [this.frontendTg],
    });

    this.listener.addTargetGroups('BackendRule', {
      targetGroups: [this.backendTg],
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*'])],
      priority: 10,
    });
  }
}

export { LoadBalancerConstruct };
