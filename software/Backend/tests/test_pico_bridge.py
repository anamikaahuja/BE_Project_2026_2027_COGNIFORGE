import time

from app.robotics.pico_bridge import PicoArmBridge


def test_send_joints_clamps_to_servo_range():
    """No calibration layer anymore -- send_joints passes raw degrees
    straight through, only clamped to a servo's absolute 0-180 range."""
    import json
    import socket

    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    listener.bind(("127.0.0.1", 0))
    listener.settimeout(2.0)
    port = listener.getsockname()[1]

    bridge = PicoArmBridge()
    bridge.configure("127.0.0.1", port)
    bridge.send_joints([-200.0, 200.0, 90.0, 90.0, 30.0], force=True)

    data, _ = listener.recvfrom(256)
    commanded = json.loads(data)["j"]
    assert commanded[0] == 0.0
    assert commanded[1] == 180.0
    assert commanded[2:] == [90.0, 90.0, 30.0]
    listener.close()


def test_bridge_does_not_send_when_disabled():
    bridge = PicoArmBridge()
    sent = bridge.send_joints([0, 0, 0, 0, 30])
    assert sent is False


def test_bridge_send_after_configure_reaches_local_socket():
    """Uses a real local UDP socket rather than mocking send -- this is
    the actual wire format the Pico firmware parses, so a test that only
    checks "was sendto called" wouldn't catch a payload the firmware can't
    actually decode."""
    import json
    import socket

    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    listener.bind(("127.0.0.1", 0))
    listener.settimeout(2.0)
    port = listener.getsockname()[1]

    bridge = PicoArmBridge()
    bridge.configure("127.0.0.1", port)
    sent = bridge.send_joints([1.0, 2.0, 3.0, 4.0, 30.0], force=True)
    assert sent is True

    data, _ = listener.recvfrom(256)
    payload = json.loads(data)
    assert "j" in payload
    assert len(payload["j"]) == 5
    listener.close()


def test_bridge_throttles_rapid_sends():
    bridge = PicoArmBridge()
    bridge.configure("127.0.0.1", 65000)
    first = bridge.send_joints([0, 0, 0, 0, 30], force=True)
    second = bridge.send_joints([1, 1, 1, 1, 30])  # not forced, sent immediately after
    assert first is True
    assert second is False  # throttled -- within MIN_SEND_INTERVAL_S


def test_bridge_disable_stops_sending():
    bridge = PicoArmBridge()
    bridge.configure("127.0.0.1", 65000)
    bridge.disable()
    sent = bridge.send_joints([0, 0, 0, 0, 30], force=True)
    assert sent is False
