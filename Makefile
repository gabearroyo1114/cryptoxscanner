all: build

build:
	./update-proto-version.py
	go build
	cd webapp && make

clean:
	rm -f cryptoxscanner
	cd webapp && $(MAKE) $@
	find . -name \*~ -delete
