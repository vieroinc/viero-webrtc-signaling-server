/**
 * Copyright 2020 Viero, Inc.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const { VieroLog } = require('@viero/common/log');
const { VieroError } = require('@viero/common/error');
const { onEvent } = require('@viero/common-nodejs/event');
const { VieroHTTPServer } = require('@viero/common-nodejs/http');
const { bodyFilter } = require('@viero/common-nodejs/http/filters/ext/body');
const { VieroWebRTCSignalingServer } = require('../');

VieroLog.level = VieroLog.LEVEL.TRACE;

const log = new VieroLog('/webrtc/signaling/server/example');

onEvent(VieroWebRTCSignalingServer.EVENT.DID_CREATE_NAMESPACE, (data) => {
  log.info('Received DID_CREATE_NAMESPACE', data.namespace);
});
onEvent(VieroWebRTCSignalingServer.EVENT.DID_ENTER_NAMESPACE, (data) => {
  log.info(`Received DID_ENTER_NAMESPACE (${data.namespace}), sending KONICHIWA to ${data.socketId}`);
  signalingServer.send(data.namespace, { word: 'konichiwa' }, data.socketId);
});
onEvent(VieroWebRTCSignalingServer.EVENT.WILL_RELAY_ENVELOPE, (data) => {
  log.info(`Received WILL_RELAY_ENVELOPE (${data.namespace}), sending WAKARIMASU to ${data.from}`);
  signalingServer.send(data.namespace, { word: 'wakarimasu' }, data.from);
});
onEvent(VieroWebRTCSignalingServer.EVENT.WILL_DELIVER_ENVELOPE, (data) => {
  log.info(`Received WILL_DELIVER_ENVELOPE (${data.namespace}), sending to ${data.from ? data.from : 'ALL'}`);
  // signalingServer.send(data.namespace, { word: 'hai' }, data.from);
});
onEvent(VieroWebRTCSignalingServer.EVENT.DID_LEAVE_NAMESPACE, (data) => {
  log.info(`Received DID_LEAVE_NAMESPACE (${data.namespace}) from ${data.socketId}. SAYONARA!`);
});

const server = new VieroHTTPServer();
const signalingServer = new VieroWebRTCSignalingServer();
server.setCORSOptions({ origins: ['http://localhost:8080'], headers: ['content-type'] });
server.registerFilter(bodyFilter, 'The body filter.');
server.run({ port: 8090 }).then(() => {
  signalingServer.run(server, { bindAdminEndpoint: true });
}).catch((err) => {
  log.error(err.userData[VieroError.KEY.ERROR].toString());
});
