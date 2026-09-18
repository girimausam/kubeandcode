FROM python:3.12-slim

RUN groupadd --gid 5000 app && useradd --uid 5000 --gid 5000 --create-home --shell /usr/sbin/nologin app

WORKDIR /app

COPY --chown=app:app requirements.txt job.py ./

RUN pip install --no-cache-dir -r requirements.txt

USER app

ENTRYPOINT ["python", "job.py"]
