#! /bin/sh

exec reflex -r '\.go$' -s -- sh -c "go run ./main.go server"
