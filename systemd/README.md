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
sudo systemctl enable gnv-meetings-fileserver.service
sudo systemctl enable gnv-meetings-download.service
sudo systemctl enable gnv-meetings-extract.service
sudo systemctl enable gnv-meetings-upload.service
sudo systemctl enable gnv-meetings-diarize.service
sudo systemctl enable gnv-meetings-discover.timer

# Start services
sudo systemctl start gnv-meetings-fileserver.service
sudo systemctl start gnv-meetings-download.service
sudo systemctl start gnv-meetings-extract.service
sudo systemctl start gnv-meetings-upload.service
sudo systemctl start gnv-meetings-diarize.service
sudo systemctl start gnv-meetings-discover.timer
```

## Monitoring

Check service status:
```bash
sudo systemctl status gnv-meetings-fileserver
sudo systemctl status gnv-meetings-download
sudo systemctl status gnv-meetings-extract  
sudo systemctl status gnv-meetings-upload
sudo systemctl status gnv-meetings-diarize
sudo systemctl status gnv-meetings-discover.timer
```

View logs:
```bash
# Individual service logs
sudo journalctl -u gnv-meetings-fileserver -f
sudo journalctl -u gnv-meetings-download -f
sudo journalctl -u gnv-meetings-extract -f
sudo journalctl -u gnv-meetings-upload -f
sudo journalctl -u gnv-meetings-diarize -f

# Discovery logs
sudo journalctl -u gnv-meetings-discover -f

# All services combined
sudo journalctl -u gnv-meetings-fileserver -u gnv-meetings-download -u gnv-meetings-extract -u gnv-meetings-upload -u gnv-meetings-diarize -f

# Last 100 lines
sudo journalctl -u gnv-meetings-download -n 100
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