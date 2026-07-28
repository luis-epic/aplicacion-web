#!/bin/sh
set -eu

load_secret() {
  variable_name="$1"
  secret_path="$2"

  if [ -z "$secret_path" ]; then
    return
  fi
  if [ ! -r "$secret_path" ]; then
    echo "Secret file for $variable_name is not readable." >&2
    exit 1
  fi

  secret_value="$(cat "$secret_path")"
  if [ -z "$secret_value" ]; then
    echo "Secret file for $variable_name is empty." >&2
    exit 1
  fi
  export "$variable_name=$secret_value"
  unset secret_value
}

load_secret DATABASE_URL "${DATABASE_URL_FILE:-}"
load_secret JWT_ACCESS_SECRET "${JWT_ACCESS_SECRET_FILE:-}"
load_secret JWT_REFRESH_SECRET "${JWT_REFRESH_SECRET_FILE:-}"

exec "$@"
