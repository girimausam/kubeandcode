"""Publish one MQTT message to AWS IoT Core with X.509 (device cert).

Install: pip install awsiotsdk
Run from dir with cert files from create-keys-and-certificate:
  python mqtt-publish-telemetry.py \\
    --endpoint a1xxxx-ats.iot.us-east-1.amazonaws.com \\
    --cert device.cert.pem --key device.private.key --ca AmazonRootCA1.pem \\
    --thing-name my-sensor-01
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from awscrt import io, mqtt
from awsiot import mqtt_connection_builder


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", required=True, help="Data-ATS endpoint host")
    parser.add_argument("--cert", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--ca", required=True)
    parser.add_argument("--thing-name", required=True)
    parser.add_argument("--topic", default=None)
    args = parser.parse_args()

    topic = args.topic or f"device/{args.thing_name}/telemetry"
    payload = {"temp_c": 22.5, "ts": int(time.time())}

    event_loop_group = io.EventLoopGroup(1)
    host_resolver = io.DefaultHostResolver(event_loop_group)
    client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)

    connection = mqtt_connection_builder.mtls_from_path(
        endpoint=args.endpoint,
        cert_filepath=args.cert,
        pri_key_filepath=args.key,
        ca_filepath=args.ca,
        client_id=args.thing_name,
        client_bootstrap=client_bootstrap,
    )

    print(f"Connecting to {args.endpoint} as {args.thing_name}...")
    connect_future = connection.connect()
    connect_future.result()
    print(f"Publishing to {topic}: {payload}")
    connection.publish(
        topic=topic,
        payload=json.dumps(payload),
        qos=mqtt.QoS.AT_LEAST_ONCE,
    ).result()
    disconnect_future = connection.disconnect()
    disconnect_future.result()
    return 0


if __name__ == "__main__":
    sys.exit(main())
