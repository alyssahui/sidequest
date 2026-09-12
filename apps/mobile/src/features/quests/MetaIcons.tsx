import { createElement } from "react";
import { Image, Platform, View } from "react-native";

type Props = {
  color: string;
  size?: number;
};

const PIN_SIZE = 14;
const PERSON_SIZE = 13;

export function LocationPinIcon({ color, size = PIN_SIZE }: Props) {
  if (Platform.OS === "web") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ height: size, width: size }}
      >
        {createElement(
          "svg",
          {
            width: "100%",
            height: "100%",
            viewBox: "0 0 24 24",
            fill: "none",
            "aria-hidden": true,
            focusable: false,
          },
          createElement("path", {
            d: "M12 21C15.5 17.4 19 14.1764 19 10.2C19 6.22355 15.866 3 12 3C8.13401 3 5 6.22355 5 10.2C5 14.1764 8.5 17.4 12 21Z",
            stroke: color,
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
          createElement("path", {
            d: "M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z",
            stroke: color,
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }),
        )}
      </View>
    );
  }

  return (
    <Image
      accessibilityElementsHidden
      source={{ uri: "/icons/location-pin.svg" }}
      style={{ height: size, tintColor: color, width: size }}
    />
  );
}

export function PersonIcon({ color, size = PERSON_SIZE }: Props) {
  if (Platform.OS === "web") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ height: size, width: size }}
      >
        {createElement(
          "svg",
          {
            width: "100%",
            height: "100%",
            viewBox: "0 0 512 512",
            "aria-hidden": true,
            focusable: false,
          },
          createElement("path", {
            fill: color,
            d: "M256,265.308c73.252,0,132.644-59.391,132.644-132.654C388.644,59.412,329.252,0,256,0 c-73.262,0-132.643,59.412-132.643,132.654C123.357,205.917,182.738,265.308,256,265.308z",
          }),
          createElement("path", {
            fill: color,
            d: "M425.874,393.104c-5.922-35.474-36-84.509-57.552-107.465c-5.829-6.212-15.948-3.628-19.504-1.427 c-27.04,16.672-58.782,26.399-92.819,26.399c-34.036,0-65.778-9.727-92.818-26.399c-3.555-2.201-13.675-4.785-19.505,1.427 c-21.55,22.956-51.628,71.991-57.551,107.465C71.573,480.444,164.877,512,256,512C347.123,512,440.427,480.444,425.874,393.104z",
          }),
        )}
      </View>
    );
  }

  return (
    <Image
      accessibilityElementsHidden
      source={{ uri: "/icons/person.svg" }}
      style={{ height: size, tintColor: color, width: size }}
    />
  );
}
