{{- define "dwh-code-review.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "dwh-code-review.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- include "dwh-code-review.name" . -}}
{{- end -}}
{{- end -}}

{{- define "dwh-code-review.backend.fullname" -}}
{{- printf "%s-backend" (include "dwh-code-review.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "dwh-code-review.web.fullname" -}}
{{- printf "%s-web" (include "dwh-code-review.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "dwh-code-review.backend.configName" -}}
{{- printf "%s-backend-config" (include "dwh-code-review.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "dwh-code-review.backend.secretName" -}}
{{- if .Values.backendSecret.name -}}
{{- .Values.backendSecret.name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-backend-secret" (include "dwh-code-review.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
