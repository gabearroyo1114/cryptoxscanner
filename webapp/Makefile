all: update-version
	./node_modules/.bin/ng build --prod --aot
	cat ../VERSION.UI > dist/BUILD
	cat ../VERSION.UI > dist/VERSION.UI

update-version:
	npm run update-build \
		$(shell cat ../VERSION.UI) $(shell cat ../VERSION.PROTO)
	cat ../VERSION.UI > src/assets/VERSION.UI

serve:
	./node_modules/.bin/ng serve


clean:
	rm -rf dist

distclean: clean
	rm -rf node_modules
