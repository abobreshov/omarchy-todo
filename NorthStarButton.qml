import QtQuick
import qs.Commons
import qs.Ui
import "NorthStar.js" as NorthStar

// The star on the bar (ADDENDUM-S11 §5.2): a BarIconButton holding U+F0AE2
// at the bar's icon size in one icon slot. Accent while set, the bar
// foreground dimmed (the kit's 0.45) while unset, hidden with no slot
// otherwise. Only its colour, its opacity and its open mark ever change
// (§5.8 B1, B5). The bar draws its open mark for the slot's owner, the todo
// panel, so the star draws its own: a copy of Bar.qml's openPanelIndicator,
// outside the button so the dimmed opacity never fades it.
Item {
  id: root

  property var bar: null
  property string starState: "hidden" // NorthStar.barState: hidden | unset | set
  property string tooltipText: ""
  property bool popupOpen: false
  signal activated() // a left click; middle and right do nothing

  readonly property alias button: icon
  readonly property alias openMark: mark
  readonly property bool vertical: bar ? bar.vertical === true : false
  readonly property string position: bar && bar.position ? bar.position : "top"

  objectName: "northStarButton"
  visible: starState !== "hidden"
  implicitWidth: icon.implicitWidth
  implicitHeight: icon.implicitHeight

  BarIconButton {
    id: icon
    anchors.fill: parent
    bar: root.bar
    text: NorthStar.GLYPH
    foreground: root.starState === "set" ? Color.accent : (root.bar ? root.bar.barForeground : Color.foreground)
    useActiveColor: false
    dimmed: root.starState === "unset"
    tooltipText: root.tooltipText
    onPressed: function(pressedButton) { if (pressedButton === Qt.LeftButton) root.activated() }
  }

  Rectangle {
    id: mark
    readonly property int inset: Style.space(2)
    visible: opacity > 0
    opacity: root.popupOpen ? 0.9 : 0
    color: Color.accent
    radius: Math.min(width, height) / 2
    width: root.vertical ? Style.space(2) : Style.space(10)
    height: root.vertical ? Style.space(10) : Style.space(2)
    x: root.vertical ? (root.position === "left" ? root.width - width - inset : inset) : Math.round((root.width - width) / 2)
    y: root.vertical ? Math.round((root.height - height) / 2) : (root.position === "top" ? root.height - height - inset : inset)
    z: 50

    Behavior on opacity {
      NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
    }
  }
}
