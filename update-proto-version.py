#! /usr/bin/env python

import sys

def main():
    protoVersion = int(open("VERSION.PROTO").read().strip())
    open("./server/protoversion.go", "w").write("""package server

const PROTO_VERSION = %d
""" % (protoVersion))

if __name__ == "__main__":
    sys.exit(main())
