// Helm Manager
// Provides Helm chart management capabilities

class HelmManager {
  constructor() {
    this.charts = new Map();
    this.releases = new Map();
    this.repositories = new Map();
    
    // Add default repositories
    this.repositories.set('stable', 'https://charts.helm.sh/stable');
    this.repositories.set('bitnami', 'https://charts.bitnami.com/bitnami');
  }

  async addRepository(name, url) {
    this.repositories.set(name, url);
    return { success: true, message: `Repository ${name} added` };
  }

  async searchChart(keyword) {
    // Simulate chart search
    const mockCharts = [
      { name: 'nginx', version: '1.0.0', repository: 'stable' },
      { name: 'postgresql', version: '11.0.0', repository: 'bitnami' },
      { name: 'redis', version: '16.0.0', repository: 'bitnami' }
    ];
    
    return mockCharts.filter(chart => 
      chart.name.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async generateChart(appConfig) {
    const chartName = appConfig.name;
    
    const chart = {
      apiVersion: 'v2',
      name: chartName,
      description: appConfig.description || 'A Helm chart for Kubernetes',
      type: 'application',
      version: '0.1.0',
      appVersion: appConfig.version || '1.0.0'
    };

    const values = {
      replicaCount: appConfig.replicas || 1,
      image: {
        repository: appConfig.image || 'nginx',
        pullPolicy: 'IfNotPresent',
        tag: appConfig.tag || 'latest'
      },
      service: {
        type: appConfig.serviceType || 'ClusterIP',
        port: appConfig.port || 80
      },
      ingress: {
        enabled: appConfig.ingressEnabled || false,
        className: '',
        annotations: {},
        hosts: appConfig.hosts || []
      },
      resources: appConfig.resources || {
        limits: { cpu: '100m', memory: '128Mi' },
        requests: { cpu: '100m', memory: '128Mi' }
      },
      autoscaling: {
        enabled: appConfig.autoscaling || false,
        minReplicas: appConfig.minReplicas || 1,
        maxReplicas: appConfig.maxReplicas || 100,
        targetCPUUtilizationPercentage: appConfig.targetCPU || 80
      }
    };

    const templates = this._generateTemplates(chartName, values);
    
    const chartPath = `charts/${chartName}`;
    this.charts.set(chartName, {
      chart,
      values,
      templates,
      path: chartPath
    });

    return chartPath;
  }

  async packageChart(chartPath) {
    const chartName = chartPath.split('/').pop();
    const chart = this.charts.get(chartName);
    
    if (!chart) {
      throw new Error(`Chart ${chartName} not found`);
    }

    // Simulate chart packaging
    const packageName = `${chartName}-${chart.chart.version}.tgz`;
    return {
      name: packageName,
      path: `packages/${packageName}`,
      size: 10240 // 10KB simulated
    };
  }

  async installRelease(chartPath, releaseName, values = {}) {
    const chartName = chartPath.split('/').pop();
    const chart = this.charts.get(chartName);
    
    if (!chart) {
      throw new Error(`Chart ${chartPath} not found`);
    }

    const mergedValues = { ...chart.values, ...values };
    
    const release = {
      name: releaseName,
      namespace: values.namespace || 'default',
      chart: chartName,
      version: chart.chart.version,
      values: mergedValues,
      status: 'deployed',
      revision: 1,
      installedAt: new Date(),
      manifest: this._renderManifest(chart.templates, mergedValues)
    };

    this.releases.set(releaseName, release);

    return {
      name: releaseName,
      namespace: release.namespace,
      status: 'deployed',
      version: release.version
    };
  }

  async upgradeRelease(releaseName, chartPath, values = {}) {
    const release = this.releases.get(releaseName);
    if (!release) {
      throw new Error(`Release ${releaseName} not found`);
    }

    const chartName = chartPath.split('/').pop();
    const chart = this.charts.get(chartName);
    
    if (!chart) {
      throw new Error(`Chart ${chartPath} not found`);
    }

    const mergedValues = { ...release.values, ...values };
    
    release.chart = chartName;
    release.version = chart.chart.version;
    release.values = mergedValues;
    release.status = 'upgraded';
    release.revision += 1;
    release.upgradedAt = new Date();
    release.manifest = this._renderManifest(chart.templates, mergedValues);

    return {
      name: releaseName,
      namespace: release.namespace,
      status: 'upgraded',
      version: release.version,
      revision: release.revision
    };
  }

  async rollbackRelease(releaseName, revision) {
    const release = this.releases.get(releaseName);
    if (!release) {
      throw new Error(`Release ${releaseName} not found`);
    }

    // Simulate rollback
    release.status = 'rolledback';
    release.revision = revision || release.revision - 1;
    
    return {
      name: releaseName,
      status: 'rolledback',
      revision: release.revision
    };
  }

  async uninstallRelease(releaseName) {
    const release = this.releases.get(releaseName);
    if (!release) {
      throw new Error(`Release ${releaseName} not found`);
    }

    this.releases.delete(releaseName);
    
    return {
      name: releaseName,
      status: 'uninstalled'
    };
  }

  async getReleaseStatus(releaseName) {
    const release = this.releases.get(releaseName);
    if (!release) {
      throw new Error(`Release ${releaseName} not found`);
    }

    return {
      name: release.name,
      namespace: release.namespace,
      status: release.status,
      chart: release.chart,
      version: release.version,
      revision: release.revision,
      installedAt: release.installedAt,
      values: release.values
    };
  }

  _generateTemplates(name, values) {
    return {
      'deployment.yaml': this._generateDeploymentTemplate(name),
      'service.yaml': this._generateServiceTemplate(name),
      'ingress.yaml': this._generateIngressTemplate(name),
      'hpa.yaml': this._generateHPATemplate(name)
    };
  }

  _generateDeploymentTemplate(name) {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "${name}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${name}.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          resources:
            {{- toYaml .Values.resources | nindent 12 }}`;
  }

  _generateServiceTemplate(name) {
    return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${name}.selectorLabels" . | nindent 4 }}`;
  }

  _generateIngressTemplate(name) {
    return `{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "${name}.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
    {{- end }}
{{- end }}`;
  }

  _generateHPATemplate(name) {
    return `{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "${name}.fullname" . }}
  labels:
    {{- include "${name}.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "${name}.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
{{- end }}`;
  }

  _renderManifest(templates, values) {
    // Simulate template rendering
    const manifests = [];
    for (const [filename, template] of Object.entries(templates)) {
      // In real implementation, would use Helm template engine
      manifests.push(`# Source: ${filename}\n${template}`);
    }
    return manifests.join('\n---\n');
  }
}

module.exports = HelmManager;