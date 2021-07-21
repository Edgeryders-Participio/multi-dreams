import { HappyEmojiIcon } from "./Icons";

const HappySpinner = ({ size = 12 }) => {
  return <HappyEmojiIcon className={`w-${size} h-${size} text-gray-500 animation-spin`} />;
};

export default HappySpinner;
