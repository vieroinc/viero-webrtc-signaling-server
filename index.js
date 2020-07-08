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

const SocketIO = require('socket.io');
const { respondCreated, respondError } = require('@viero/common-nodejs/http/respond');
const { http412 } = require('@viero/common-nodejs/http/error');
const { VieroWebRTCSignalingCommon } = require('@viero/webrtc-signaling-common');
const { VieroLog } = require('@viero/common/log');
const { VieroUID } = require('@viero/common/uid');

const log = new VieroLog('/signaling/server');

class VieroWebRTCSignalingServer {

  run(server) {
    server.post(
      '/signaling/namespace',
      ({ req: { body }, res }) => {
        this.ensureNameSpace(body.name).then((nameSpace) => {
          if (nameSpace) {
            return respondCreated(res, { namespace: nameSpace.name });
          }
          respondError(res, http412());
        });
      },
      'Creates a signaling namespace, eg a room.'
    );

    this._io = SocketIO(server.httpServer);
    this._io.engine.generateId = (req) => VieroUID.uuid();
  }

  ensureNameSpace(name) {
    name = `/${name}`;
    if (this._io.nsps[name]) {
      return Promise.resolve(this._io.nsps[name]);
    }
    const nsp = this._io.of(name);
    nsp.on('connection', (socket) => {
      const socketId = socket.id;
      socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.ENTER, socketId);
      socket.on(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, (payload) => {
        socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, payload);
      });
      socket.on('disconnect', (socket) => {
        nsp.emit(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, socketId);
      });
    });
    return Promise.resolve(nsp);
  };

};

module.exports = {
  VieroWebRTCSignalingServer,
};
