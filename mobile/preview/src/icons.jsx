import React from "react";
import glyphs from "../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import font from "../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf?url";
const style = document.createElement("style");
style.textContent = `@font-face {font-family:CatatIonicons;src:url(${font}) format('truetype');font-display:block;}`;
document.head.appendChild(style);
export default function Icon({ name, color, size = 20 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        fontFamily: "CatatIonicons",
        fontSize: size,
        color,
        lineHeight: 1,
        display: "inline-block",
        fontWeight: 400,
      }}
    >
      {String.fromCodePoint(glyphs[name] || glyphs["ellipse-outline"])}
    </span>
  );
}
