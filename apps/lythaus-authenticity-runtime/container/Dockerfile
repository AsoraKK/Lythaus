# syntax=docker/dockerfile:1
FROM node:24.6.0-bookworm-slim@sha256:9b741b28148b0195d62fa456ed84dd6c953c1f17a3761f3e6e6797a754d9edff AS node
FROM python:3.13.5-slim-bookworm@sha256:4c2cf9917bd1cbacc5e9b07320025bdb7cdf2df7b0ceaccb55e9dd7e30987419 AS source
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY packages/authenticity/src /app/packages/authenticity/src
COPY apps/lythaus-authenticity-runtime/container /app/apps/lythaus-authenticity-runtime/container
RUN mkdir -p /tmp/beta && chown 65532:65532 /tmp/beta
USER 65532:65532
ENV PYTHONDONTWRITEBYTECODE=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8080
CMD ["python", "-u", "apps/lythaus-authenticity-runtime/container/supervisor.py"]

FROM source AS code-validation
CMD ["python", "apps/lythaus-authenticity-runtime/container/test_supervisor.py"]

FROM source AS runtime
USER root
COPY apps/lythaus-authenticity-runtime/container/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --require-hashes --no-deps --only-binary=:all: -r /tmp/requirements.txt && pip check
COPY apps/lythaus-authenticity-runtime/container/prepare_artifacts.py /tmp/prepare_artifacts.py
RUN --mount=type=secret,id=safe_rights,required=true --mount=type=secret,id=safe_checkpoint,required=true python /tmp/prepare_artifacts.py
USER 65532:65532
CMD ["python", "-u", "apps/lythaus-authenticity-runtime/container/supervisor.py"]
