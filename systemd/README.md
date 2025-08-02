# Systemd Service Configuration

## Installation

1. Copy service files to systemd directory:
```bash
sudo cp gnv-meetings-*.{service,timer} /etc/systemd/system/
```

2. Create system user:
```bash
sudo useradd -r -s /bin/false gnv-meetings
sudo usermod -a -G docker gnv-meetings  # For Redis access
```

3. Set up application directory:
```bash
sudo mkdir -p /opt/gnv-city-meetings
sudo cp -r /path/to/project/* /opt/gnv-city-meetings/
sudo chown -R gnv-meetings:gnv-meetings /opt/gnv-city-meetings
```

4. Install dependencies:
```bash
cd /opt/gnv-city-meetings
sudo -u gnv-meetings npm install --production
```

5. Enable and start services:
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable gnv-meetings-worker.service
sudo systemctl enable gnv-meetings-discover.timer

# Start services
sudo systemctl start gnv-meetings-worker.service
sudo systemctl start gnv-meetings-discover.timer
```

## Monitoring

Check service status:
```bash
sudo systemctl status gnv-meetings-worker
sudo systemctl status gnv-meetings-discover.timer
```

View logs:
```bash
# Worker logs
sudo journalctl -u gnv-meetings-worker -f

# Discovery logs
sudo journalctl -u gnv-meetings-discover -f

# Last 100 lines
sudo journalctl -u gnv-meetings-worker -n 100
```

Check timer schedule:
```bash
systemctl list-timers gnv-meetings-discover.timer
```

## Manual runs

Run discovery manually:
```bash
sudo systemctl start gnv-meetings-discover.service
```