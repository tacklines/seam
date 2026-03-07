#!/bin/bash
set -euo pipefail
exec > >(tee /var/log/user-data.log | logger -t user-data) 2>&1

# ============================================================
# 1. System setup: packages
# ============================================================
dnf update -y

# AL2023 ships curl-minimal which conflicts with curl — use --allowerasing
dnf install -y --allowerasing docker jq git curl
dnf install -y amazon-ssm-agent 2>/dev/null || true

systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user

# Install docker-compose (aarch64 binary)
COMPOSE_VERSION="v2.27.0"
curl -fsSL "https://github.com/docker/compose/releases/download/$${COMPOSE_VERSION}/docker-compose-linux-aarch64" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ============================================================
# 2. Install Caddy (direct arm64 binary)
# ============================================================
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /usr/bin/caddy
chmod +x /usr/bin/caddy
setcap cap_net_bind_service=+ep /usr/bin/caddy
groupadd --system caddy
useradd --system --gid caddy --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
mkdir -p /etc/caddy

# ============================================================
# 3. Write Caddyfile
# ============================================================
cat > /etc/caddy/Caddyfile <<CADDYFILE
seam.${domain_name} {
	tls ${acme_email}
	encode gzip

	# API, MCP, and WebSocket — proxy to seam-server
	handle /api/* {
		reverse_proxy localhost:3002
	}
	handle /mcp {
		reverse_proxy localhost:3002
	}
	handle /ws {
		reverse_proxy localhost:3002
	}
	handle /.well-known/* {
		reverse_proxy localhost:3002
	}

	# Frontend — static files with SPA fallback
	handle {
		root * /opt/seam/static
		try_files {path} /index.html
		file_server
	}
}

auth.seam.${domain_name} {
	tls ${acme_email}

	# Login V2 UI (Next.js container)
	reverse_proxy /ui/v2/login/* localhost:3100

	# Zitadel API + Console + OIDC
	reverse_proxy h2c://localhost:8080
}
CADDYFILE

# ============================================================
# 4. Caddy cert backup/restore from S3
# ============================================================
CADDY_S3_PATH="s3://seam-backups/caddy/caddy-data.tar.gz"
CADDY_DATA="/var/lib/caddy/.local/share/caddy"

cat > /usr/local/bin/caddy-cert-restore <<'SCRIPT'
#!/bin/bash
set -euo pipefail
S3_PATH="$1"
CADDY_DATA="$2"
if aws s3 ls "$S3_PATH" > /dev/null 2>&1; then
  echo "Restoring Caddy certs from S3..."
  mkdir -p "$CADDY_DATA"
  aws s3 cp "$S3_PATH" /tmp/caddy-data.tar.gz
  tar -xzf /tmp/caddy-data.tar.gz -C "$CADDY_DATA"
  chown -R caddy:caddy /var/lib/caddy
  rm -f /tmp/caddy-data.tar.gz
  echo "Caddy certs restored."
else
  echo "No Caddy cert backup found in S3, starting fresh."
fi
SCRIPT
chmod +x /usr/local/bin/caddy-cert-restore

cat > /usr/local/bin/caddy-cert-backup <<'SCRIPT'
#!/bin/bash
set -euo pipefail
S3_PATH="$1"
CADDY_DATA="$2"
if [ -d "$CADDY_DATA" ] && [ "$(ls -A "$CADDY_DATA" 2>/dev/null)" ]; then
  echo "Backing up Caddy certs to S3..."
  tar -czf /tmp/caddy-data.tar.gz -C "$CADDY_DATA" .
  aws s3 cp /tmp/caddy-data.tar.gz "$S3_PATH"
  rm -f /tmp/caddy-data.tar.gz
  echo "Caddy certs backed up."
else
  echo "No Caddy data to back up."
fi
SCRIPT
chmod +x /usr/local/bin/caddy-cert-backup

# Restore certs before first start
/usr/local/bin/caddy-cert-restore "$CADDY_S3_PATH" "$CADDY_DATA"

# ============================================================
# 5. Caddy systemd unit (with cert backup on stop)
# ============================================================
cat > /etc/systemd/system/caddy.service <<UNIT
[Unit]
Description=Caddy
After=network.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
ExecStopPost=+/usr/local/bin/caddy-cert-backup $CADDY_S3_PATH $CADDY_DATA
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

# Daily cert backup timer
cat > /etc/systemd/system/caddy-cert-backup.service <<TIMER_UNIT
[Unit]
Description=Backup Caddy certs to S3

[Service]
Type=oneshot
ExecStart=/usr/local/bin/caddy-cert-backup $CADDY_S3_PATH $CADDY_DATA
TIMER_UNIT

cat > /etc/systemd/system/caddy-cert-backup.timer <<TIMER_UNIT
[Unit]
Description=Daily Caddy cert backup

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
TIMER_UNIT

systemctl daemon-reload
systemctl enable --now caddy-cert-backup.timer
systemctl enable caddy
systemctl start caddy

# ============================================================
# 6. Install Tailscale
# ============================================================
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --auth-key="${tailscale_auth_key}" --hostname=seam-prod

# ============================================================
# 7. Fetch secrets from SSM and write .env
# ============================================================
mkdir -p /opt/seam
REGION="${aws_region}"

PG_PASS=$(aws ssm get-parameter --name "/seam/postgres-password" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
RMQ_PASS=$(aws ssm get-parameter --name "/seam/rabbitmq-password" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
ZIT_MASTER=$(aws ssm get-parameter --name "/seam/zitadel-masterkey" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
ZIT_DB_PASS=$(aws ssm get-parameter --name "/seam/zitadel-db-password" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
ZIT_ADMIN_PASS=$(aws ssm get-parameter --name "/seam/zitadel-admin-password" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
CRED_KEY=$(aws ssm get-parameter --name "/seam/credential-master-key" --with-decryption --query "Parameter.Value" --output text --region "$REGION")
WORKER_TOKEN=$(aws ssm get-parameter --name "/seam/worker-api-token" --with-decryption --query "Parameter.Value" --output text --region "$REGION")

DOCKER_GID=$(getent group docker | cut -d: -f3)
ECR_URL="${ecr_url}"

cat > /opt/seam/.env <<ENV
POSTGRES_DB=seam
POSTGRES_USER=seam
POSTGRES_PASSWORD=$PG_PASS
RABBITMQ_DEFAULT_USER=seam
RABBITMQ_DEFAULT_PASS=$RMQ_PASS
ZITADEL_MASTERKEY=$ZIT_MASTER
ZITADEL_DATABASE_POSTGRES_USER_PASSWORD=$ZIT_DB_PASS
ZITADEL_ADMIN_PASSWORD=$ZIT_ADMIN_PASS
SEAM_IMAGE=$ECR_URL:latest
CREDENTIAL_MASTER_KEY=$CRED_KEY
MCP_AUTH_DISABLED=false
WORKER_API_TOKEN=$WORKER_TOKEN
CODER_TOKEN=
CODER_ACCESS_URL=http://$(tailscale ip -4):7080
DOCKER_GID=$DOCKER_GID
ENV
chown ec2-user:ec2-user /opt/seam/.env
chmod 600 /opt/seam/.env

# ============================================================
# 8. Install ECR credential helper
# ============================================================
dnf install -y amazon-ecr-credential-helper
ECR_REGISTRY=$(echo "$ECR_URL" | cut -d/ -f1)
mkdir -p /root/.docker
cat > /root/.docker/config.json <<DOCKERCFG
{"credHelpers":{"$ECR_REGISTRY":"ecr-login"}}
DOCKERCFG

# ============================================================
# 9. Clone repo (for docker-compose.prod.yml and infra configs)
# ============================================================
git clone https://github.com/tacklines/seam.git /opt/seam/repo
cp /opt/seam/.env /opt/seam/repo/.env

# ============================================================
# 10. Pull images, extract frontend, and start
# ============================================================
cd /opt/seam/repo
docker pull "$ECR_URL:latest" || true

# Extract frontend static files from the image for Caddy to serve
mkdir -p /opt/seam/static
docker create --name seam-extract "$ECR_URL:latest" true 2>/dev/null || true
docker cp seam-extract:/app/static/. /opt/seam/static/
docker rm seam-extract
chown -R caddy:caddy /opt/seam/static

/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d

# ============================================================
# 11. Systemd unit for Seam
# ============================================================
cat > /etc/systemd/system/seam.service <<UNIT
[Unit]
Description=Seam Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/seam/repo
EnvironmentFile=/opt/seam/.env
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable seam

# ============================================================
# 12. Backup cron — pg_dump daily to S3
# ============================================================
cat > /usr/local/bin/seam-backup <<'SCRIPT'
#!/bin/bash
set -euo pipefail
source /opt/seam/.env
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker exec $(docker ps -qf "name=postgres") pg_dump -U seam seam | gzip > /tmp/seam-$TIMESTAMP.sql.gz
aws s3 cp /tmp/seam-$TIMESTAMP.sql.gz s3://seam-backups/postgres/seam-$TIMESTAMP.sql.gz
rm -f /tmp/seam-$TIMESTAMP.sql.gz
# Keep last 7 days
aws s3 ls s3://seam-backups/postgres/ | sort | head -n -7 | awk '{print $4}' | while read f; do
  aws s3 rm "s3://seam-backups/postgres/$f"
done
SCRIPT
chmod +x /usr/local/bin/seam-backup

cat > /etc/systemd/system/seam-backup.service <<UNIT
[Unit]
Description=Seam PostgreSQL backup to S3

[Service]
Type=oneshot
ExecStart=/usr/local/bin/seam-backup
UNIT

cat > /etc/systemd/system/seam-backup.timer <<UNIT
[Unit]
Description=Daily Seam PostgreSQL backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now seam-backup.timer

echo "=== Seam user-data complete ==="
