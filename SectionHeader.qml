pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons

Text {
  required property var panel
  required property var modelData
  height: Style.space(28)
  leftPadding: Style.spacing.lg
  verticalAlignment: Text.AlignVCenter
  text: modelData.caption
  textFormat: Text.PlainText
  color: Qt.darker(panel.contentForeground, 1.4)
  font.family: panel.contentFontFamily
  font.pixelSize: Style.font.caption
  font.bold: true
}
