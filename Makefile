all: build

build:
	./update-proto-version.py
	go build

clean:
	rm -f cryptoxscanner
	cd webapp && $(MAKE) $@
	find . -name \*~ -delete
