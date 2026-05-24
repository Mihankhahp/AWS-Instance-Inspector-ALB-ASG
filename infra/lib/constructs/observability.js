import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

class ObservabilityConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const { alb, frontendTg, backendTg, frontendAsg, backendAsg } = props;

    // ── Log Groups ────────────────────────────────────────────────────────
    this.backendLogGroup = new logs.LogGroup(this, 'BackendLogs', {
      logGroupName: '/inspector/backend',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.frontendLogGroup = new logs.LogGroup(this, 'FrontendLogs', {
      logGroupName: '/inspector/frontend',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Metric helpers ────────────────────────────────────────────────────
    const p1m = cdk.Duration.minutes(1);
    const albDim = { LoadBalancer: alb.loadBalancerFullName };

    const albMetric = (metricName, stat, label) =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName,
        dimensionsMap: albDim,
        period: p1m,
        statistic: stat,
        label,
      });

    const tgMetric = (tg, metricName, stat, label) =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName,
        dimensionsMap: {
          LoadBalancer: alb.loadBalancerFullName,
          TargetGroup: tg.targetGroupFullName,
        },
        period: p1m,
        statistic: stat,
        label,
      });

    const asgMetric = (asg, metricName, label) =>
      new cloudwatch.Metric({
        namespace: 'AWS/AutoScaling',
        metricName,
        dimensionsMap: { AutoScalingGroupName: asg.autoScalingGroupName },
        period: p1m,
        statistic: 'Average',
        label,
      });

    const cpuMetric = (asg, label) =>
      new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: { AutoScalingGroupName: asg.autoScalingGroupName },
        period: p1m,
        statistic: 'Average',
        label,
      });

    // ── Dashboard ─────────────────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'InstanceInspector',
      defaultInterval: cdk.Duration.minutes(30),
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown:
          '# 🔍 Instance Inspector — Observability\nReal-time traffic, scaling capacity, CPU, and logs.',
        width: 24,
        height: 2,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Requests / Target (the scaling trigger)',
        left: [
          tgMetric(
            frontendTg,
            'RequestCountPerTarget',
            'Sum',
            'Frontend req/target',
          ),
          tgMetric(
            backendTg,
            'RequestCountPerTarget',
            'Sum',
            'Backend req/target',
          ),
        ],
        leftAnnotations: [
          { value: 500, label: 'Scale-out threshold', color: '#ff9900' },
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Response Latency (p50)',
        left: [albMetric('TargetResponseTime', 'p50', 'Latency p50 (s)')],
        leftYAxis: { label: 'seconds', showUnits: false },
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Errors (5xx)',
        left: [
          albMetric('HTTPCode_ELB_5XX_Count', 'Sum', 'ALB 5xx'),
          albMetric('HTTPCode_Target_5XX_Count', 'Sum', 'Target 5xx'),
        ],
        width: 8,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Frontend Fleet — Capacity',
        left: [
          asgMetric(frontendAsg, 'GroupDesiredCapacity', 'Desired'),
          asgMetric(frontendAsg, 'GroupInServiceInstances', 'In Service'),
          asgMetric(frontendAsg, 'GroupPendingInstances', 'Pending'),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'Backend Fleet — Capacity',
        left: [
          asgMetric(backendAsg, 'GroupDesiredCapacity', 'Desired'),
          asgMetric(backendAsg, 'GroupInServiceInstances', 'In Service'),
          asgMetric(backendAsg, 'GroupPendingInstances', 'Pending'),
        ],
        width: 8,
      }),
      new cloudwatch.GraphWidget({
        title: 'CPU Utilization (avg per fleet)',
        left: [
          cpuMetric(frontendAsg, 'Frontend avg CPU %'),
          cpuMetric(backendAsg, 'Backend avg CPU %'),
        ],
        leftAnnotations: [
          { value: 60, label: 'Busy threshold', color: '#f85149' },
        ],
        width: 8,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.LogQueryWidget({
        title: 'Backend — Recent Logs',
        logGroupNames: [this.backendLogGroup.logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, @message',
          'sort @timestamp desc',
          'limit 25',
        ],
        width: 12,
        height: 6,
      }),
      new cloudwatch.LogQueryWidget({
        title: 'Frontend — Nginx Access Logs',
        logGroupNames: [this.frontendLogGroup.logGroupName],
        view: cloudwatch.LogQueryVisualizationType.TABLE,
        queryLines: [
          'fields @timestamp, @message',
          'sort @timestamp desc',
          'limit 25',
        ],
        width: 12,
        height: 6,
      }),
    );
  }
}

export { ObservabilityConstruct };
