#!/bin/sh
set -eu

if [ -n "${OPENAI_API_KEY_FILE:-}" ]; then
  OPENAI_API_KEY="$(tr -d '\r\n' < "${OPENAI_API_KEY_FILE}")"
  export OPENAI_API_KEY
fi

if [ -n "${IA50_INTERNAL_TOKEN_FILE:-}" ]; then
  IA50_INTERNAL_TOKEN="$(tr -d '\r\n' < "${IA50_INTERNAL_TOKEN_FILE}")"
  export IA50_INTERNAL_TOKEN
fi

if [ "${IA50_INTERNAL_MODE:-false}" = "true" ]; then
  : "${OPENAI_API_KEY:?OPENAI_API_KEY or OPENAI_API_KEY_FILE is required in IA50 internal mode}"
  : "${IA50_INTERNAL_TOKEN:?IA50_INTERNAL_TOKEN or IA50_INTERNAL_TOKEN_FILE is required in IA50 internal mode}"
  if [ "${#IA50_INTERNAL_TOKEN}" -lt 32 ]; then
    echo "IA50_INTERNAL_TOKEN must contain at least 32 characters" >&2
    exit 1
  fi
fi

exec "$@"
