FROM node:22-slim

# Install Python and other dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create directories
RUN mkdir -p downloads/metadata downloads/youtube-chapters

# Clone and install the custom fork of yt-dlp
RUN apt-get update && \
    apt-get install -y git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Clone the specific fork and install it
RUN git clone https://github.com/robjwells/yt-dlp.git /tmp/yt-dlp && \
    cd /tmp/yt-dlp && \
    pip3 install -e . && \
    ln -s /tmp/yt-dlp/yt_dlp/__main__.py /usr/local/bin/yt-dlp

# Set yt-dlp path environment variable
ENV YTDLP_PATH=yt-dlp

# Default command
CMD ["npm", "run", "process"]