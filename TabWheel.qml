pragma ComponentBehavior: Bound
import QtQuick

WheelHandler {
  id: handler
  required property var panel
  property bool shiftOnly: true
  orientation: shiftOnly ? Qt.Vertical : Qt.Horizontal
  acceptedModifiers: shiftOnly ? Qt.ShiftModifier : Qt.NoModifier
  acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
  // Disable automatic rotation/property handling. The pure accumulator owns it.
  property: ""
  onWheel: function(ev) {
    panel.wheelTab({ ax: ev.angleDelta.x, ay: ev.angleDelta.y,
      px: ev.pixelDelta.x, py: ev.pixelDelta.y, phase: ev.phase,
      device: ev.device, shift: (ev.modifiers & Qt.ShiftModifier) !== 0,
      inverted: ev.inverted, at: Date.now() })
  }
}
