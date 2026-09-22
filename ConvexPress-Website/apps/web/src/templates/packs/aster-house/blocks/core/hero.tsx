import { defineBlock } from "../../../../sdk/block-renderer/model";
import { HeroComposition } from "../../../../sdk/block-renderer/hero-composition";
import { HeroDefault } from "../../../../sdk/block-renderer/hero-default";
import "../owned.css";
export default defineBlock("core/hero", (props) => {
	if (props.style === "editorial" || props.style === "poster") return <div className="cp-hero-treatment aster-house-hero-treatment"><HeroComposition attrs={props.attrs} resources={props.resources} variant={props.style} /></div>;
	return <HeroDefault {...props} />;
});
