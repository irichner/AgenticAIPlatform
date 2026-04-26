FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

RUN mkdir -p /files

ENV HOST=0.0.0.0
ENV PORT=8023
ENV ALLOWED_DIR=/files

EXPOSE 8023

CMD ["python", "server.py"]
