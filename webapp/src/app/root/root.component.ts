// Copyright 2018 Cranky Kernel
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import {Component, OnInit} from '@angular/core';
import * as toastr from "toastr";
import {ScannerApiService} from '../scanner-api.service';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';

@Component({
    selector: 'app-root',
    templateUrl: './root.component.html',
})
export class RootComponent implements OnInit {

    private uiVersionInterval: any;

    constructor(private tokenFxApi: ScannerApiService,
                private http: HttpClient) {
    }

    private checkProtoVersion() {
        this.tokenFxApi.ping().subscribe((response) => {
            if (response.version != this.tokenFxApi.PROTO_VERSION) {
                toastr.warning(`Service has been updated.
                    <a href="javascript:window.location.href=window.location.href"
                     type="button" class="btn btn-primary btn-block">Reload Now</a>`,
                        `Reload required`, {
                            progressBar: true,
                            timeOut: 15000,
                            onHidden: () => {
                                location.reload();
                            }
                        });
            }
        });
    }

    private checkUiVersion() {
        this.http.get("/assets/VERSION.UI").subscribe((response) => {
            console.log(`Server UI version: ${response}; local version: ${environment.uiVersion}.`);
            try {
                const serverBuildNumber = +response;
                const thisBuildNumber = +environment.uiVersion;
                if (!(isNaN(serverBuildNumber) || isNaN(thisBuildNumber))) {
                    if (serverBuildNumber == 0 || thisBuildNumber == 0) {
                        return;
                    }
                    if (serverBuildNumber != thisBuildNumber) {
                        console.log(`Running UI version: ${thisBuildNumber}; server UI version: ${serverBuildNumber}`);
                        toastr.info(`The UI has been updated.
                    <a href="javascript:window.location.href=window.location.href"
                     type="button" class="btn btn-primary btn-block">Reload Now</a>`,
                                ``, {
                                    progressBar: true,
                                    timeOut: 0,
                                    closeButton: true,
                                    onHidden: () => {
                                        location.reload();
                                    }
                                });
                        window.clearInterval(this.uiVersionInterval);
                    }
                }
            } catch (err) {
                console.log("caught error checking server build version:");
                console.log(err);
            }
        }, (error) => {
            // Might be running dev...
        });
    }

    ngOnInit() {
        this.checkProtoVersion();
        setInterval(() => {
            this.checkProtoVersion();
        }, 60000);

        this.checkUiVersion();
        this.uiVersionInterval = setInterval(() => {
            this.checkUiVersion();
        }, 60000);
    }
}
