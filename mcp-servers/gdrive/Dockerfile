FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

ENV HOST=0.0.0.0
ENV PORT=8024
ENV BACKEND_URL=http://backend:8000

EXPOSE 8024

CMD ["python", "server.py"]
