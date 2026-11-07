# Build context: repository root (needs inputs/, examples/, evidence/, scripts/ for tests)
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv/backend
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/app ./app

FROM base AS test
COPY backend/requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY backend/tests ./tests
COPY inputs /srv/inputs
COPY examples /srv/examples
COPY evidence /srv/evidence
COPY scripts /srv/scripts
CMD ["python", "-m", "pytest", "tests", "-q", "-p", "no:warnings", "--cov=app", "--cov-report=term-missing"]

FROM base AS runtime
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
