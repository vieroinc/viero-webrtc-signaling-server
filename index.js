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
const { VieroWebRTCCommon } = require('@viero/webrtc-common');
const { respondCreated, respondError } = require('@viero/common-nodejs/http/respond');
const { http412 } = require('@viero/common-nodejs/http/error');
const { emitEvent } = require('@viero/common-nodejs/event');


// const log = new VieroLog('/signaling/server');

const _defaultOptions = {
  bindAdminEndpoint: true,
  relayNonAddressed: true,
};

class VieroWebRTCSignalingServer {

  run(server, options = {}) {
    options = { ..._defaultOptions, ...options };
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
    this._options = options;
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

      // 1. let existing peers know about new peer.
      // broadcasting to everyone except the peer and messaging the embedding application too
      emitEvent(VieroWebRTCSignalingServer.EVENT.DID_ENTER_NAMESPACE, { namespace, socketId });
      socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.ENTER, { socketId });

      // 2. let new peer know about existing peers.
      // routing to send() API
      const payload = { word: VieroWebRTCCommon.WORD.HELLO, data: Object.keys(nsp.sockets).filter((socketId) => socketId !== socket.id) };
      this.send(namespace, payload, socket.id);

      // 3. subscribe socket to MESSAGE
      socket.on(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, (envelope) => {
        if (!envelope) return;

        // 3.1. complete envelope
        envelope.from = socket.id;

        if (envelope.to) {

          // 3.2. envelopes with "to" shall be delivered to specific socket
          // delivering to the peer and messaging the embedding application too
          const toSocket = nsp.sockets[envelope.to];
          if (!toSocket) return;
          emitEvent(VieroWebRTCSignalingServer.EVENT.WILL_RELAY_ENVELOPE, { namespace, ...envelope, relay: true });
          toSocket.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, envelope);

        } else {

          // 3.3. envelopes without "to" shall be delivered to all sockets except the sender one
          // broadcasting to everyone except the peer and messaging the embedding application too
          emitEvent(VieroWebRTCSignalingServer.EVENT.WILL_RELAY_ENVELOPE, { namespace, ...envelope, relay: this._options.relayNonAddressed });
          if (this._options.relayNonAddressed) {
            socket.broadcast.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, envelope);
          }
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
    const envelope = { payload, ...(to ? { to } : {}) };
    if (to) {
      const socket = nsp.sockets[to];
      if (socket) {
        emitEvent(VieroWebRTCSignalingServer.EVENT.WILL_DELIVER_ENVELOPE, { namespace, ...envelope });
        socket.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, envelope);
      }
    } else {
      emitEvent(VieroWebRTCSignalingServer.EVENT.WILL_DELIVER_ENVELOPE, { namespace, ...envelope });
      nsp.emit(VieroWebRTCSignalingCommon.SIGNAL.MESSAGE, envelope);
    }
  }

};

VieroWebRTCSignalingServer.EVENT = {
  DID_CREATE_NAMESPACE: 'VieroWebRTCSignalingServerEventDidCreateNamespace',
  DID_ENTER_NAMESPACE: 'VieroWebRTCSignalingServerEventDidEnterNamespace',
  DID_LEAVE_NAMESPACE: 'VieroWebRTCSignalingServerEventDidLeaveNamespace',

  WILL_RELAY_ENVELOPE: 'VieroWebRTCSignalingServerEventWillRelayEnvelope',
  WILL_DELIVER_ENVELOPE: 'VieroWebRTCSignalingServerEventWillDeliverEnvelope',
};

module.exports = {
  VieroWebRTCSignalingServer,
};
