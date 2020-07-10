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
const { VieroWebRTCSignalingCommon } = require('@viero/webrtc-signaling-common');
// const { VieroLog } = require('@viero/common/log');
const { VieroUID } = require('@viero/common/uid');
const { respondCreated, respondError } = require('@viero/common-nodejs/http/respond');
const { http412 } = require('@viero/common-nodejs/http/error');
const { emitEvent } = require('@viero/common-nodejs/event');


// const log = new VieroLog('/signaling/server');

class VieroWebRTCSignalingServer {

  run(server, options = {}) {
    if (options.bindAdminEndpoint) {
      server.post(
        '/signaling/namespace',
        ({ req: { body }, res }) => {
          this.ensureNamespace(body.name).then((nsp) => {
            if (nsp) {
              return respondCreated(res, { namespace: nsp.name });
            }
            respondError(res, http412());
          });
        },
        'Creates a signaling namespace, eg a room.'
      );
    }
    this._io = SocketIO(server.httpServer);
    this._io.engine.generateId = (req) => VieroUID.uuid();
  }

  ensureNamespace(namespace) {
    namespace = `/${namespace}`;
    if (this._io.nsps[namespace]) {
      return Promise.resolve(this._io.nsps[namespace]);
    }
    const nsp = this._io.of(namespace);
    nsp.on('connection', (socket) => {
      const socketId = socket.id;
      emitEvent(VieroWebRTCSignalingServer.EVENT.DID_ENTER_NAMESPACE, { namespace, socketId });
      socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.ENTER, { socketId });
      socket.on(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, (message) => {
        if (!message) return;
        message.from = socket.id;
        if (message.to) {
          const toSocket = nsp.sockets[message.to];
          if (!toSocket) return;
          emitEvent(VieroWebRTCSignalingServer.EVENT.DID_MESSAGE_NAMESPACE, { namespace, message });
          toSocket.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, message);
        } else {
          emitEvent(VieroWebRTCSignalingServer.EVENT.DID_MESSAGE_NAMESPACE, { namespace, message });
          // if no recipient is set the recipient is the server
          //socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, message);
        }
      });
      socket.on('disconnect', (socket) => {
        emitEvent(VieroWebRTCSignalingServer.EVENT.DID_LEAVE_NAMESPACE, { namespace, socketId });
        nsp.emit(VieroWebRTCSignalingCommon.SIGNAL.LEAVE, { socketId });
      });
    });
    emitEvent(VieroWebRTCSignalingServer.EVENT.DID_CREATE_NAMESPACE, { namespace });
    return Promise.resolve(nsp);
  };

  send(namespace, payload, to) {
    const nsp = this._io.nsps[namespace];
    if (!nsp) {
      return;
    }
    if (to) {
      const socket = nsp.sockets[to];
      if (socket) {
        const message = { payload, to };
        emitEvent(VieroWebRTCSignalingServer.EVENT.DID_MESSAGE_NAMESPACE, { namespace, message });
        socket.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, message);
      }
    } else {
      const message = { payload };
      emitEvent(VieroWebRTCSignalingServer.EVENT.DID_MESSAGE_NAMESPACE, { namespace, message });
      nsp.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, message);
    }
  }

};

VieroWebRTCSignalingServer.EVENT = {
  DID_CREATE_NAMESPACE: 'VieroWebRTCSignalingServerEventDidCreateNamespace',
  DID_ENTER_NAMESPACE: 'VieroWebRTCSignalingServerEventDidEnterNamespace',
  DID_MESSAGE_NAMESPACE: 'VieroWebRTCSignalingServerEventDidMessageNamespace',
  DID_LEAVE_NAMESPACE: 'VieroWebRTCSignalingServerEventDidLeaveNamespace',
};

module.exports = {
  VieroWebRTCSignalingServer,
};
