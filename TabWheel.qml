pragma ComponentBehavior: Bound
import QtQuick

WheelHandler {
  id: handler
  required property var panel
  property bool shiftOnly: true
  orientation: shiftOnly ? Qt.Vertical : Qt.Horizontal
  // H retains the default modifier mask; only S restricts modifiers.
  property Binding shiftModifiers: Binding { target: handler; property: "acceptedModifiers"; value: Qt.ShiftModifier; when: handler.shiftOnly }
  acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
  // Disable automatic rotation/property handling. The pure accumulator owns it.
  property: ""
  onWheel: function(ev) {
    panel.wheelTab({ ax: ev.angleDelta.x, ay: ev.angleDelta.y,
      px: ev.pixelDelta.x, py: ev.pixelDelta.y, phase: ev.phase,
      device: ev.device, shift: handler.shiftOnly,
      inverted: ev.inverted, at: Date.now() })
  }
}
