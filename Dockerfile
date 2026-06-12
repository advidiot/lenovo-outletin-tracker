# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Create Python runner stage
FROM python:3.11-slim AS runner

# Install libcurl and other system dependencies for curl_cffi
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy python dependencies and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY backend /app/backend
COPY app.py /app/app.py

# Copy pre-built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose server port (default 8000)
EXPOSE 8000

# Set environment defaults
ENV PORT=8000

# Run backend app
CMD ["python", "app.py"]
