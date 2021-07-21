import Link from "next/link";
import { stringToColor } from "../utils/stringToHslColor";
import ProgressBar from "./ProgressBar";
import { CoinIcon, CommentIcon } from "./Icons";
import Label from "./Label";

const DreamCard = ({ dream, event }) => {
  const showFundingStats =
    (dream.minGoal || dream.maxGoal) && dream.approved && !dream.canceled;
  return (
    <div className="relative bg-white rounded-lg shadow-md overflow-hidden flex flex-col w-full hover:shadow-lg transition-shadow duration-75 ease-in-out">
      {dream.images.length ? (
        <img
          src={dream.images[0].small}
          className="w-full h-48 object-cover object-center"
        />
      ) : (
        <div className={`w-full h-48 bg-${stringToColor(dream.title)}`} />
      )}
      {!dream.published && (
        <Label className="absolute right-0 m-2">Unpublished</Label>
      )}
      <div className="p-4 pt-3 flex-grow flex flex-col justify-between">
        <div className="mb-2">
          <h3 className="text-xl font-medium mb-1 truncate">{dream.title}</h3>

          <div className="text-gray-800">{dream.summary}</div>
        </div>
        <div>
          {showFundingStats && (
            <ProgressBar
              color={event.color}
              ratio={(dream.totalContributions + dream.income) / dream.minGoal}
              className="mt-2 mb-3"
            />
          )}

          <div className="flex space-x-3 mt-1">
            {showFundingStats && (
              <div className="flex items-center text-gray-700">
                <CoinIcon className="w-5 h-5" />
                <span className="block ml-1 text-sm">
                  {Math.round(
                    ((dream.totalContributions + dream.income) /
                      dream.minGoal) *
                      100
                  )}
                  %
                </span>
              </div>
            )}

            {parseInt(dream.numberOfComments) > 0 && (
              <Link
                href="/[event]/[dream]#comments"
                as={`/${event.slug}/${dream.id}#comments`}
              >
                <div className="flex items-center text-gray-700">
                  <CommentIcon className="w-5 h-5" />
                  <span className="block ml-1 text-sm">
                    {dream.numberOfComments}
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DreamCard;
